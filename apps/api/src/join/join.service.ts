import { assertUniqueInCollege, normEmail, normRoll } from '../members/identity';
import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JoinInfo, JoinResult, JoinSettings } from '@arc/types';
import {
  emailOnDomains,
  normalizeJoinCode,
  type JoinOrganizationParsed,
  type SetCollegeEmailInput,
} from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import type { FirebaseIdentityInfo } from '../auth/auth.types';
import type { User } from '../generated/prisma/client';
import { joinCodeFree } from '../departments/departments.controller';
import { PrismaService } from '../prisma/prisma.service';

// No 0/O/1/I/L so codes are easy to read aloud and type from a projector.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

@Injectable()
export class JoinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  // ───────── Admin: manage the link ─────────

  async settings(orgId: string): Promise<JoinSettings> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { joinCode: true, joinEnabled: true, collegeEmailDomains: true },
    });
    const learnerCount = await this.prisma.organizationMember.count({
      where: { organizationId: orgId, status: 'ACTIVE', roles: { has: 'LEARNER' } },
    });
    return {
      enabled: org.joinEnabled,
      code: org.joinCode,
      learnerCount,
      collegeEmailDomains: org.collegeEmailDomains,
    };
  }

  async setDomains(actor: User, orgId: string, domains: string[]): Promise<JoinSettings> {
    const clean = [...new Set(domains.map((d) => d.toLowerCase()))];
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { collegeEmailDomains: clean },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'join_link.email_domains',
      entityType: 'organization',
      entityId: orgId,
      meta: { domains: clean },
    });
    return this.settings(orgId);
  }

  async setEnabled(actor: User, orgId: string, enabled: boolean): Promise<JoinSettings> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { joinCode: true, slug: true },
    });
    // Students must pick their department, so there has to be at least one to pick from.
    if (enabled && !(await this.prisma.department.count({ where: { organizationId: orgId } })))
      throw new ConflictException({
        code: 'NO_DEPARTMENTS',
        message: 'Add the college’s departments first — students choose one when they register.',
      });
    const joinCode = org.joinCode ?? (await this.newCode(org.slug));
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { joinEnabled: enabled, joinCode },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: enabled ? 'join_link.enabled' : 'join_link.disabled',
      entityType: 'organization',
      entityId: orgId,
    });
    return this.settings(orgId);
  }

  /** New code; the old link stops working immediately. */
  async regenerate(actor: User, orgId: string): Promise<JoinSettings> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { slug: true },
    });
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { joinCode: await this.newCode(org.slug) },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'join_link.regenerated',
      entityType: 'organization',
      entityId: orgId,
    });
    return this.settings(orgId);
  }

  private async newCode(slug: string) {
    const prefix =
      slug
        .replace(/[^a-z]/gi, '')
        .toUpperCase()
        .slice(0, 8) || 'JOIN';
    for (let i = 0; i < 10; i++) {
      const suffix = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
      const code = `${prefix}-${suffix}`;
      if (await joinCodeFree(this.prisma, code)) return code;
    }
    throw new Error('Could not generate a unique join code');
  }

  // ───────── Public / students ─────────

  async info(rawCode: string): Promise<JoinInfo> {
    const { org, dept } = await this.openOrg(rawCode);
    const departments = await this.prisma.department.findMany({
      where: { organizationId: org.id },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return {
      code: dept?.joinCode ?? org.joinCode!,
      organizationId: org.id,
      organizationName: org.name,
      organizationType: org.type,
      primaryColor: org.primaryColor,
      departments,
      collegeEmailDomains: org.collegeEmailDomains,
      department: dept ? { id: dept.id, name: dept.name } : null,
    };
  }

  private checkCollegeEmail(email: string, domains: string[]) {
    if (!emailOnDomains(email, domains))
      throw new BadRequestException({
        code: 'COLLEGE_EMAIL_REQUIRED',
        message: `Use your college email (ending in @${domains.join(' or @')})`,
      });
  }

  /** A student adds / corrects the college email for one of their colleges. */
  async setCollegeEmail(user: User, input: SetCollegeEmailInput) {
    const m = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: user.id } },
      include: { organization: { select: { collegeEmailDomains: true } } },
    });
    if (!m || m.status !== 'ACTIVE')
      throw new NotFoundException('You aren’t a member of this college');
    this.checkCollegeEmail(input.collegeEmail, m.organization.collegeEmailDomains);
    const collegeEmail = normEmail(input.collegeEmail);
    await assertUniqueInCollege(
      this.prisma,
      input.organizationId,
      { collegeEmail },
      user.id,
      false,
    );
    await this.prisma.organizationMember.update({
      where: { id: m.id },
      data: { collegeEmail },
    });
    return { collegeEmail };
  }

  async join(
    identity: FirebaseIdentityInfo,
    existing: User | undefined,
    rawCode: string,
    input: JoinOrganizationParsed,
  ): Promise<JoinResult> {
    const { org, dept: locked } = await this.openOrg(rawCode);
    // A department's own link puts the student in that department.
    const departmentId = locked?.id ?? input.departmentId;
    const dept = departmentId
      ? await this.prisma.department.findFirst({
          where: { id: departmentId, organizationId: org.id },
        })
      : null;
    if (!dept)
      throw new BadRequestException({
        code: 'INVALID_DEPARTMENT',
        message: 'Choose your department from the list',
      });
    this.checkCollegeEmail(input.collegeEmail, org.collegeEmailDomains);
    const externalId = normRoll(input.externalId);
    const collegeEmail = normEmail(input.collegeEmail);
    // One student, one account: the roll number and college email must not be registered already.
    const already = existing
      ? await this.prisma.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: org.id, userId: existing.id } },
        })
      : null;
    if (!already)
      await assertUniqueInCollege(
        this.prisma,
        org.id,
        { externalId, collegeEmail },
        existing?.id ?? null,
        false,
      );
    const user = existing ?? (await this.auth.sync(identity, { fullName: input.fullName }));
    if (user.status !== 'ACTIVE')
      throw new ForbiddenException({
        code: 'ACCOUNT_DISABLED',
        message: 'Your account is not active',
      });

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    });
    if (membership) {
      if (membership.status !== 'ACTIVE') {
        throw new ForbiddenException({
          code: 'MEMBERSHIP_DISABLED',
          message: `Your access to ${org.name} has been disabled. Contact your college admin.`,
        });
      }
      if (!membership.collegeEmail) {
        const taken = await this.prisma.organizationMember.count({
          where: {
            organizationId: org.id,
            userId: { not: user.id },
            collegeEmail: { equals: collegeEmail ?? '', mode: 'insensitive' },
          },
        });
        if (!taken)
          await this.prisma.organizationMember.update({
            where: { id: membership.id },
            data: { collegeEmail },
          });
      }
      return { organizationId: org.id, organizationName: org.name, alreadyMember: true };
    }

    await this.prisma.$transaction([
      this.prisma.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          roles: ['LEARNER'],
          departmentId: dept.id,
          externalId,
          collegeEmail,
        },
      }),
      // Keep the name the student typed if their account had only an email-derived name.
      ...(existing &&
      existing.fullName !== input.fullName &&
      existing.fullName === existing.email.split('@')[0]
        ? [this.prisma.user.update({ where: { id: user.id }, data: { fullName: input.fullName } })]
        : []),
    ]);
    await this.audit.log({
      actorId: user.id,
      organizationId: org.id,
      action: 'member.joined',
      entityType: 'organization_member',
      meta: { email: user.email, name: input.fullName, via: 'join_link' },
    });
    return { organizationId: org.id, organizationName: org.name, alreadyMember: false };
  }

  /** The college (and department, for a department link) a join code belongs to. */
  private async openOrg(rawCode: string) {
    const code = normalizeJoinCode(rawCode);
    const deptRow = await this.prisma.department.findUnique({
      where: { joinCode: code },
      include: { organization: true },
    });
    if (deptRow && deptRow.joinEnabled && deptRow.organization.status === 'ACTIVE') {
      const { organization, ...dept } = deptRow;
      return { org: organization, dept };
    }
    const org = deptRow
      ? null
      : await this.prisma.organization.findUnique({ where: { joinCode: code } });
    if (!org || !org.joinEnabled || org.status !== 'ACTIVE') {
      throw new NotFoundException({
        code: 'JOIN_CODE_INVALID',
        message:
          'This join link is invalid or registration is closed. Ask your college for a new link.',
      });
    }
    return { org, dept: null };
  }
}
