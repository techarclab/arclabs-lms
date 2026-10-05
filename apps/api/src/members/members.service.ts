import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import { ownActionLink } from '../auth/password-reset.service';
import {
  hasPermission,
  type BulkInviteResult,
  type BulkInviteRowResult,
  type InviteResult,
  type MemberCounts,
  type MemberSummary,
  type OrgRole,
  type Paginated,
} from '@arc/types';
import {
  emailOnDomains,
  inviteMemberSchema,
  type InviteMemberParsed,
  type ListMembersQuery,
  type RemoveMembersInput,
  type UpdateMemberInput,
  type BulkInviteInput,
} from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import type { OrgContextInfo } from '../auth/auth.types';
import { FIREBASE_AUTH } from '../auth/firebase-admin.provider';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import type { Prisma, User } from '../generated/prisma/client';
import { inviteEmail } from '../mail/templates';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const ROLE_LABEL: Record<string, string> = {
  ORG_ADMIN: 'Org Admin',
  ORG_VIEWER: 'Viewer (read-only)',
  CONTENT_MANAGER: 'Content Manager',
  INSTRUCTOR: 'Instructor',
  EVALUATOR: 'Evaluator',
  LEARNER: 'Learner',
};

const memberInclude = {
  user: { select: { id: true, fullName: true, email: true, lastLoginAt: true, status: true } },
  department: { select: { id: true, name: true } },
} satisfies Prisma.OrganizationMemberInclude;

type MemberRow = Prisma.OrganizationMemberGetPayload<{ include: typeof memberInclude }>;

function toMember(m: MemberRow, actorId: string): MemberSummary {
  const state =
    m.status !== 'ACTIVE' || m.user.status !== 'ACTIVE'
      ? 'INACTIVE'
      : m.user.lastLoginAt
        ? 'ACTIVE'
        : 'INVITED';
  return {
    id: m.id,
    userId: m.user.id,
    fullName: m.user.fullName,
    email: m.user.email,
    collegeEmail: m.collegeEmail,
    roles: m.roles,
    state,
    department: m.department,
    externalId: m.externalId,
    joinedAt: m.joinedAt.toISOString(),
    lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
    isSelf: m.user.id === actorId,
  };
}

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ───────── Queries ─────────

  async list(
    actor: User,
    org: OrgContextInfo,
    q: ListMembersQuery,
  ): Promise<Paginated<MemberSummary>> {
    const where: Prisma.OrganizationMemberWhereInput = {
      organizationId: org.organizationId,
      ...(q.role ? { roles: { has: q.role } } : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.status === 'INACTIVE'
        ? { OR: [{ status: { not: 'ACTIVE' } }, { user: { status: { not: 'ACTIVE' } } }] }
        : {}),
      ...(q.status === 'ACTIVE'
        ? { status: 'ACTIVE', user: { status: 'ACTIVE', lastLoginAt: { not: null } } }
        : {}),
      ...(q.status === 'INVITED'
        ? { status: 'ACTIVE', user: { status: 'ACTIVE', lastLoginAt: null } }
        : {}),
    };
    if (q.search) {
      const s = q.search;
      where.AND = [
        {
          OR: [
            { user: { fullName: { contains: s, mode: 'insensitive' } } },
            { user: { email: { contains: s, mode: 'insensitive' } } },
            { externalId: { contains: s, mode: 'insensitive' } },
          ],
        },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.organizationMember.count({ where }),
      this.prisma.organizationMember.findMany({
        where,
        include: memberInclude,
        orderBy: [{ joinedAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => toMember(r, actor.id)),
      meta: { page: q.page, pageSize: q.pageSize, total },
    };
  }

  async counts(org: OrgContextInfo): Promise<MemberCounts> {
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId: org.organizationId },
      select: { roles: true, status: true, user: { select: { status: true, lastLoginAt: true } } },
    });
    const c: MemberCounts = { total: rows.length, active: 0, invited: 0, inactive: 0, byRole: {} };
    for (const r of rows) {
      if (r.status !== 'ACTIVE' || r.user.status !== 'ACTIVE') c.inactive++;
      else if (r.user.lastLoginAt) c.active++;
      else c.invited++;
      if (r.status === 'ACTIVE')
        for (const role of r.roles) c.byRole[role] = (c.byRole[role] ?? 0) + 1;
    }
    return c;
  }

  // ───────── Invitations ─────────

  async invite(actor: User, org: OrgContextInfo, input: InviteMemberParsed): Promise<InviteResult> {
    this.assertCanGrant(actor, org, input.roles as OrgRole[]);
    const orgRow = await this.orgOrThrow(org.organizationId);
    if (input.departmentId) await this.departmentOrThrow(org.organizationId, input.departmentId);

    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      const existing = await this.prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId: org.organizationId, userId: existingUser.id },
        },
      });
      if (existing) {
        throw new ConflictException({
          code: 'ALREADY_MEMBER',
          message: `${input.email} is already a member of this organization`,
        });
      }
    }

    let user = existingUser;
    let created = false;
    if (!user) {
      const firebaseUid = await this.ensureFirebaseUser(input.email, input.fullName);
      user = await this.prisma.user.upsert({
        where: { firebaseUid },
        update: {},
        create: { firebaseUid, email: input.email, fullName: input.fullName },
      });
      created = true;
    }

    const member = await this.prisma.organizationMember.create({
      data: {
        organizationId: org.organizationId,
        userId: user.id,
        roles: input.roles,
        departmentId: input.departmentId ?? null,
        externalId: input.externalId ?? null,
      },
      include: memberInclude,
    });

    const isNewAccount = !user.lastLoginAt;
    const link = await this.accessLink(user.email, isNewAccount);
    let emailQueued = false;
    if (input.sendEmail) {
      const mail = inviteEmail({
        name: user.fullName,
        orgName: orgRow.name,
        inviterName: actor.fullName,
        roles: input.roles.map((r) => ROLE_LABEL[r] ?? r).join(', '),
        link,
        isNewAccount,
      });
      emailQueued = await this.mail.send({ to: user.email, ...mail }, 'invite');
    }

    await this.audit.log({
      actorId: actor.id,
      organizationId: org.organizationId,
      action: 'member.invited',
      entityType: 'organization_member',
      entityId: member.id,
      meta: { email: user.email, name: user.fullName, roles: input.roles, created },
    });

    return {
      member: toMember(member, actor.id),
      created,
      emailQueued,
      ...(this.revealLink(emailQueued) ? { inviteLink: link } : {}),
    };
  }

  async bulkInvite(
    actor: User,
    org: OrgContextInfo,
    input: BulkInviteInput,
  ): Promise<BulkInviteResult> {
    const defaults = (input.defaultRoles ?? ['LEARNER']) as OrgRole[];
    const results: BulkInviteRowResult[] = [];
    const seen = new Set<string>();
    const deptCache = new Map<string, string>();
    const existingDepts = await this.prisma.department.findMany({
      where: { organizationId: org.organizationId },
    });
    for (const d of existingDepts) deptCache.set(d.name.toLowerCase(), d.id);

    for (const [i, row] of input.rows.entries()) {
      const rowNo = i + 2; // header is row 1
      const email = (row.email ?? '').trim().toLowerCase();
      if (seen.has(email)) {
        results.push({ row: rowNo, email, status: 'skipped', message: 'Duplicate in file' });
        continue;
      }
      seen.add(email);

      let departmentId: string | undefined;
      if (row.department?.trim()) {
        const key = row.department.trim().toLowerCase();
        departmentId = deptCache.get(key);
        if (!departmentId && hasPermission(this.effectiveRoles(actor, org), 'department.manage')) {
          const d = await this.prisma.department.create({
            data: { organizationId: org.organizationId, name: row.department.trim() },
          });
          departmentId = d.id;
          deptCache.set(key, d.id);
        }
      }

      const parsed = inviteMemberSchema.safeParse({
        email,
        fullName: row.fullName?.trim() || email.split('@')[0],
        roles: row.roles?.length ? row.roles : defaults,
        departmentId,
        externalId: row.externalId,
        sendEmail: input.sendEmail ?? true,
      });
      if (!parsed.success) {
        results.push({
          row: rowNo,
          email,
          status: 'error',
          message: parsed.error.issues[0]?.message,
        });
        continue;
      }
      try {
        const r = await this.invite(actor, org, parsed.data);
        results.push({ row: rowNo, email, status: r.created ? 'invited' : 'added' });
      } catch (e) {
        const status = e instanceof ConflictException ? 'skipped' : 'error';
        const msg = e instanceof ConflictException ? 'Already a member' : (e as Error).message;
        if (status === 'error') this.logger.warn(`Bulk invite row ${rowNo} failed: ${msg}`);
        results.push({ row: rowNo, email, status, message: msg });
      }
    }

    const count = (s: BulkInviteRowResult['status']) =>
      results.filter((r) => r.status === s).length;
    return {
      invited: count('invited'),
      added: count('added'),
      skipped: count('skipped'),
      errors: count('error'),
      results,
    };
  }

  async resendInvite(actor: User, org: OrgContextInfo, memberId: string) {
    const m = await this.memberOrThrow(org.organizationId, memberId);
    if (m.user.lastLoginAt) {
      throw new BadRequestException({
        code: 'ALREADY_ACTIVE',
        message: 'This person has already signed in',
      });
    }
    const orgRow = await this.orgOrThrow(org.organizationId);
    const link = await this.accessLink(m.user.email, true);
    const mail = inviteEmail({
      name: m.user.fullName,
      orgName: orgRow.name,
      inviterName: actor.fullName,
      roles: m.roles.map((r) => ROLE_LABEL[r] ?? r).join(', '),
      link,
      isNewAccount: true,
    });
    const emailQueued = await this.mail.send({ to: m.user.email, ...mail }, 'invite');
    await this.audit.log({
      actorId: actor.id,
      organizationId: org.organizationId,
      action: 'member.invite_resent',
      entityType: 'organization_member',
      entityId: m.id,
      meta: { email: m.user.email },
    });
    return { emailQueued, ...(this.revealLink(emailQueued) ? { inviteLink: link } : {}) };
  }

  // ───────── Updates ─────────

  async update(
    actor: User,
    org: OrgContextInfo,
    memberId: string,
    input: UpdateMemberInput,
  ): Promise<MemberSummary> {
    const m = await this.memberOrThrow(org.organizationId, memberId);
    const isSelf = m.userId === actor.id;
    const wasAdmin = m.roles.includes('ORG_ADMIN');

    if (input.roles) {
      const adding = input.roles.filter((r) => !m.roles.includes(r));
      const removing = m.roles.filter((r) => !input.roles!.includes(r));
      if (adding.includes('ORG_ADMIN') || removing.includes('ORG_ADMIN')) {
        this.assertCanGrant(actor, org, ['ORG_ADMIN']);
      }
      if (isSelf && removing.includes('ORG_ADMIN') && !actor.isSuperAdmin) {
        throw new ForbiddenException({
          code: 'SELF_DEMOTION',
          message: 'You can’t remove your own admin role',
        });
      }
    }
    if (input.status === 'INACTIVE' && isSelf) {
      throw new ForbiddenException({
        code: 'SELF_DEACTIVATION',
        message: 'You can’t deactivate yourself',
      });
    }
    if (input.departmentId) await this.departmentOrThrow(org.organizationId, input.departmentId);

    const losesAdmin =
      wasAdmin &&
      m.status === 'ACTIVE' &&
      ((input.roles && !input.roles.includes('ORG_ADMIN')) || input.status === 'INACTIVE');
    if (losesAdmin) {
      const admins = await this.prisma.organizationMember.count({
        where: {
          organizationId: org.organizationId,
          status: 'ACTIVE',
          roles: { has: 'ORG_ADMIN' },
        },
      });
      if (admins <= 1) {
        throw new ConflictException({
          code: 'LAST_ADMIN',
          message: 'This is the organization’s only admin. Make someone else an Org Admin first.',
        });
      }
    }

    const identity = await this.changeIdentity(actor, org, m, input);

    const updated = await this.prisma.organizationMember.update({
      where: { id: m.id },
      data: {
        ...(input.collegeEmail !== undefined ? { collegeEmail: input.collegeEmail } : {}),
        ...(input.roles ? { roles: input.roles } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
        ...(input.externalId !== undefined ? { externalId: input.externalId || null } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      include: memberInclude,
    });

    const action =
      input.status === 'INACTIVE'
        ? 'member.deactivated'
        : input.status === 'ACTIVE' && m.status !== 'ACTIVE'
          ? 'member.reactivated'
          : 'member.updated';
    await this.audit.log({
      actorId: actor.id,
      organizationId: org.organizationId,
      action,
      entityType: 'organization_member',
      entityId: m.id,
      meta: {
        email: m.user.email,
        name: m.user.fullName,
        ...(input.roles ? { rolesBefore: m.roles, rolesAfter: input.roles } : {}),
        ...identity,
        ...(input.collegeEmail !== undefined && input.collegeEmail !== m.collegeEmail
          ? { collegeEmailBefore: m.collegeEmail, collegeEmailAfter: input.collegeEmail }
          : {}),
      },
    });
    return toMember(updated, actor.id);
  }

  /**
   * Fixes a person's sign-in email and/or name (the account itself, also in Firebase), and checks
   * the college email. The account is shared by every college the person is in, so a college
   * admin can only change it when the person belongs to their college alone.
   */
  private async changeIdentity(
    actor: User,
    org: OrgContextInfo,
    m: MemberRow,
    input: UpdateMemberInput,
  ): Promise<Record<string, unknown>> {
    if (input.collegeEmail) {
      const o = await this.prisma.organization.findUnique({
        where: { id: org.organizationId },
        select: { collegeEmailDomains: true },
      });
      if (!emailOnDomains(input.collegeEmail, o?.collegeEmailDomains ?? []))
        throw new BadRequestException({
          code: 'COLLEGE_EMAIL_REQUIRED',
          message: `College email must end in @${o!.collegeEmailDomains.join(' or @')}`,
        });
    }
    const newEmail = input.email && input.email !== m.user.email.toLowerCase() ? input.email : null;
    const newName = input.fullName && input.fullName !== m.user.fullName ? input.fullName : null;
    if (!newEmail && !newName) return {};

    if (!actor.isSuperAdmin) {
      const elsewhere = await this.prisma.organizationMember.count({
        where: { userId: m.userId, organizationId: { not: org.organizationId } },
      });
      if (elsewhere)
        throw new ForbiddenException({
          code: 'SHARED_ACCOUNT',
          message:
            'This person is also in another college, so only ARC LABS can change their sign-in email or name.',
        });
    }
    if (newEmail) {
      const taken = await this.prisma.user.findFirst({
        where: { email: { equals: newEmail, mode: 'insensitive' }, id: { not: m.userId } },
        select: { id: true },
      });
      if (taken)
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message: `Another account already uses ${newEmail}. Remove that one first, or ask the student which is right.`,
        });
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: m.userId },
      select: { firebaseUid: true },
    });
    if (user.firebaseUid) {
      try {
        await this.auth.updateUser(user.firebaseUid, {
          ...(newEmail ? { email: newEmail } : {}),
          ...(newName ? { displayName: newName } : {}),
        });
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'auth/email-already-exists')
          throw new ConflictException({
            code: 'EMAIL_TAKEN',
            message: `${newEmail} already has an ARC LABS login. Ask the student to sign in with it instead.`,
          });
        if (code !== 'auth/user-not-found') throw e;
        // No Firebase login yet: the new email is linked when they first sign in.
      }
    }
    await this.prisma.user.update({
      where: { id: m.userId },
      data: { ...(newEmail ? { email: newEmail } : {}), ...(newName ? { fullName: newName } : {}) },
    });
    return {
      ...(newEmail ? { emailBefore: m.user.email, emailAfter: newEmail } : {}),
      ...(newName ? { nameBefore: m.user.fullName, nameAfter: newName } : {}),
    };
  }

  /**
   * Removes people from the organization (their membership row). Their ARC LABS account and past
   * exam attempts stay, so results already given are kept; they can join again with a join code.
   * You can't remove yourself or the last active Org Admin — those are skipped.
   */
  async remove(actor: User, org: OrgContextInfo, input: RemoveMembersInput) {
    const rows = await this.prisma.organizationMember.findMany({
      where: {
        organizationId: org.organizationId,
        ...(input.allDeactivated
          ? { OR: [{ status: { not: 'ACTIVE' } }, { user: { status: { not: 'ACTIVE' } } }] }
          : { id: { in: input.ids ?? [] } }),
      },
      include: memberInclude,
    });
    if (!input.allDeactivated && rows.length === 0) throw new NotFoundException();

    const skipped: { id: string; name: string; reason: string }[] = [];
    let keep = rows.filter((m) => {
      if (m.userId === actor.id) {
        skipped.push({ id: m.id, name: m.user.fullName, reason: 'You can’t remove yourself' });
        return false;
      }
      return true;
    });
    if (keep.some((m) => m.roles.includes('ORG_ADMIN'))) {
      this.assertCanGrant(actor, org, ['ORG_ADMIN']);
      const activeAdmins = await this.prisma.organizationMember.findMany({
        where: {
          organizationId: org.organizationId,
          status: 'ACTIVE',
          roles: { has: 'ORG_ADMIN' },
        },
        select: { id: true },
      });
      const removing = new Set(keep.map((m) => m.id));
      if (activeAdmins.length > 0 && activeAdmins.every((a) => removing.has(a.id))) {
        keep = keep.filter((m) => {
          if (activeAdmins.some((a) => a.id === m.id)) {
            skipped.push({
              id: m.id,
              name: m.user.fullName,
              reason: 'The organization’s only admin — make someone else an Org Admin first',
            });
            return false;
          }
          return true;
        });
      }
    }
    if (keep.length) {
      await this.prisma.organizationMember.deleteMany({
        where: { id: { in: keep.map((m) => m.id) } },
      });
      await this.prisma.auditLog.createMany({
        data: keep.map((m) => ({
          actorId: actor.id,
          organizationId: org.organizationId,
          action: 'member.removed',
          entityType: 'organization_member',
          entityId: m.id,
          meta: {
            email: m.user.email,
            name: m.user.fullName,
            roles: m.roles,
            department: m.department?.name ?? null,
            externalId: m.externalId,
          },
        })),
      });
    }
    return { removed: keep.length, skipped };
  }

  // ───────── Helpers ─────────

  private effectiveRoles(actor: User, org: OrgContextInfo): OrgRole[] {
    return actor.isSuperAdmin ? ['ORG_ADMIN'] : org.roles;
  }

  /** Granting or revoking Org Admin needs user.role.assign; other roles only need user.manage. */
  private assertCanGrant(actor: User, org: OrgContextInfo, roles: OrgRole[]) {
    if (
      roles.includes('ORG_ADMIN') &&
      !hasPermission(this.effectiveRoles(actor, org), 'user.role.assign')
    ) {
      throw new ForbiddenException({
        message: 'Only Org Admins can grant or remove the Org Admin role',
      });
    }
  }

  private async orgOrThrow(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!org) throw new NotFoundException();
    return org;
  }

  private async memberOrThrow(orgId: string, memberId: string) {
    const m = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: orgId },
      include: memberInclude,
    });
    if (!m) throw new NotFoundException();
    return m;
  }

  private async departmentOrThrow(orgId: string, id: string) {
    const d = await this.prisma.department.findFirst({ where: { id, organizationId: orgId } });
    if (!d)
      throw new BadRequestException({
        code: 'INVALID_DEPARTMENT',
        message: 'Department not found in this organization',
      });
    return d;
  }

  /** Returns the Firebase uid for this email, creating a password-less account when needed. */
  private async ensureFirebaseUser(email: string, displayName: string): Promise<string> {
    try {
      return (await this.auth.getUserByEmail(email)).uid;
    } catch (e) {
      if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
    }
    return (await this.auth.createUser({ email, displayName, emailVerified: false })).uid;
  }

  /** The admin sees the link to share by hand when no email went out (or always outside production). */
  private revealLink(emailSent: boolean) {
    return !emailSent || this.env.NODE_ENV !== 'production';
  }

  /** New accounts get a "set your password" link; existing accounts a sign-in link. */
  private async accessLink(email: string, isNewAccount: boolean) {
    const loginUrl = `${this.env.WEB_ORIGIN.split(',')[0]}/login?email=${encodeURIComponent(email)}`;
    if (!isNewAccount) return loginUrl;
    try {
      return ownActionLink(
        await this.auth.generatePasswordResetLink(email, { url: loginUrl }),
        this.env.WEB_ORIGIN.split(',')[0]!.replace(/\/$/, ''),
      );
    } catch (e) {
      this.logger.warn(`Could not generate password link for ${email}: ${(e as Error).message}`);
      return loginUrl;
    }
  }
}
