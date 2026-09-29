import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JoinInfo, JoinResult, JoinSettings } from '@arc/types';
import { normalizeJoinCode, type JoinOrganizationParsed } from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import type { FirebaseIdentityInfo } from '../auth/auth.types';
import type { User } from '../generated/prisma/client';
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
      select: { joinCode: true, joinEnabled: true },
    });
    const learnerCount = await this.prisma.organizationMember.count({
      where: { organizationId: orgId, status: 'ACTIVE', roles: { has: 'LEARNER' } },
    });
    return { enabled: org.joinEnabled, code: org.joinCode, learnerCount };
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
      if (
        !(await this.prisma.organization.findUnique({
          where: { joinCode: code },
          select: { id: true },
        }))
      )
        return code;
    }
    throw new Error('Could not generate a unique join code');
  }

  // ───────── Public / students ─────────

  async info(rawCode: string): Promise<JoinInfo> {
    const org = await this.openOrg(rawCode);
    const departments = await this.prisma.department.findMany({
      where: { organizationId: org.id },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return {
      code: org.joinCode!,
      organizationId: org.id,
      organizationName: org.name,
      organizationType: org.type,
      primaryColor: org.primaryColor,
      departments,
    };
  }

  async join(
    identity: FirebaseIdentityInfo,
    existing: User | undefined,
    rawCode: string,
    input: JoinOrganizationParsed,
  ): Promise<JoinResult> {
    const org = await this.openOrg(rawCode);
    const dept = await this.prisma.department.findFirst({
      where: { id: input.departmentId, organizationId: org.id },
    });
    if (!dept)
      throw new BadRequestException({
        code: 'INVALID_DEPARTMENT',
        message: 'Choose your department from the list',
      });
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
      return { organizationId: org.id, organizationName: org.name, alreadyMember: true };
    }

    await this.prisma.$transaction([
      this.prisma.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          roles: ['LEARNER'],
          departmentId: input.departmentId,
          externalId: input.externalId,
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

  private async openOrg(rawCode: string) {
    const code = normalizeJoinCode(rawCode);
    const org = await this.prisma.organization.findUnique({ where: { joinCode: code } });
    if (!org || !org.joinEnabled || org.status !== 'ACTIVE') {
      throw new NotFoundException({
        code: 'JOIN_CODE_INVALID',
        message:
          'This join link is invalid or registration is closed. Ask your college for a new link.',
      });
    }
    return org;
  }
}
