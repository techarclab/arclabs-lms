import { randomInt } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { DepartmentDetail, DepartmentStudent, DepartmentSummary } from '@arc/types';
import { createDepartmentSchema, type CreateDepartmentInput } from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import type { OrgContextInfo } from '../auth/auth.types';
import { CurrentUser, OrgContext, RequirePermission } from '../auth/decorators';
import { UuidPipe } from '../common/uuid.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Department, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// No 0/O/1/I/L so codes are easy to read aloud and type from a projector.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const STAFF = ['ORG_ADMIN', 'CONTENT_MANAGER', 'INSTRUCTOR', 'EVALUATOR'] as const;

/** Is this join code free (colleges and departments share one code space)? */
export async function joinCodeFree(prisma: PrismaService, code: string) {
  const [o, d] = await Promise.all([
    prisma.organization.findUnique({ where: { joinCode: code }, select: { id: true } }),
    prisma.department.findUnique({ where: { joinCode: code }, select: { id: true } }),
  ]);
  return !o && !d;
}

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private summary(
    d: Department,
    counts: { members: number; learners: number; staff: number },
  ): DepartmentSummary {
    return {
      id: d.id,
      name: d.name,
      memberCount: counts.members,
      learnerCount: counts.learners,
      staffCount: counts.staff,
      joinCode: d.joinCode,
      joinEnabled: d.joinEnabled,
    };
  }

  private async counts(orgId: string) {
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId, status: 'ACTIVE', departmentId: { not: null } },
      select: { departmentId: true, roles: true },
    });
    const by = new Map<string, { members: number; learners: number; staff: number }>();
    for (const r of rows) {
      const c = by.get(r.departmentId!) ?? { members: 0, learners: 0, staff: 0 };
      c.members++;
      if (r.roles.includes('LEARNER')) c.learners++;
      if (r.roles.some((x) => (STAFF as readonly string[]).includes(x))) c.staff++;
      by.set(r.departmentId!, c);
    }
    return by;
  }

  /** Faculty assigned to a department only see their own. */
  async list(org: OrgContextInfo): Promise<DepartmentSummary[]> {
    const rows = await this.prisma.department.findMany({
      where: {
        organizationId: org.organizationId,
        ...(org.departmentId ? { id: org.departmentId } : {}),
      },
      orderBy: { name: 'asc' },
    });
    const by = await this.counts(org.organizationId);
    return rows.map((d) => this.summary(d, by.get(d.id) ?? { members: 0, learners: 0, staff: 0 }));
  }

  private async find(org: OrgContextInfo, id: string) {
    if (org.departmentId && org.departmentId !== id) throw new NotFoundException();
    const d = await this.prisma.department.findFirst({
      where: { id, organizationId: org.organizationId },
    });
    if (!d) throw new NotFoundException();
    return d;
  }

  /** One department's page: its faculty and how much is shared with it. */
  async detail(org: OrgContextInfo, id: string): Promise<DepartmentDetail> {
    const d = await this.find(org, id);
    const orgId = org.organizationId;
    const forDept = { OR: [{ assignToAll: true }, { audiences: { some: { departmentId: id } } }] };
    const [by, staff, exams, materials, labs, announcements] = await Promise.all([
      this.counts(orgId),
      this.prisma.organizationMember.findMany({
        where: {
          organizationId: orgId,
          departmentId: id,
          status: 'ACTIVE',
          roles: { hasSome: [...STAFF] },
        },
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { user: { fullName: 'asc' } },
      }),
      this.prisma.quiz.count({ where: { organizationId: orgId, courseId: null, ...forDept } }),
      this.prisma.material.count({ where: { organizationId: orgId, ...forDept } }),
      this.prisma.labAssessment.count({ where: { organizationId: orgId, ...forDept } }),
      this.prisma.announcement.count({
        where: {
          organizationId: orgId,
          OR: [
            { audience: { path: ['type'], equals: 'all' } },
            { audience: { path: ['departmentIds'], array_contains: [id] } },
          ],
        },
      }),
    ]);
    return {
      ...this.summary(d, by.get(d.id) ?? { members: 0, learners: 0, staff: 0 }),
      staff: staff.map((m) => ({
        userId: m.user.id,
        fullName: m.user.fullName,
        email: m.user.email,
        roles: m.roles,
      })),
      counts: { exams, materials, labs, announcements },
    };
  }

  /** The department's students (for department pages; faculty only see their own department). */
  async students(org: OrgContextInfo, id: string): Promise<DepartmentStudent[]> {
    await this.find(org, id);
    const rows = await this.prisma.organizationMember.findMany({
      where: {
        organizationId: org.organizationId,
        departmentId: id,
        status: 'ACTIVE',
        roles: { has: 'LEARNER' },
      },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: [{ externalId: 'asc' }, { user: { fullName: 'asc' } }],
    });
    return rows.map((m) => ({
      userId: m.user.id,
      fullName: m.user.fullName,
      email: m.user.email,
      collegeEmail: m.collegeEmail,
      externalId: m.externalId,
      joinedAt: m.joinedAt.toISOString(),
    }));
  }

  async create(actor: User, orgId: string, input: CreateDepartmentInput): Promise<DepartmentSummary> {
    const d = await this.prisma.department.create({
      data: { organizationId: orgId, name: input.name },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'department.created',
      entityType: 'department',
      entityId: d.id,
      meta: { name: d.name },
    });
    return this.summary(d, { members: 0, learners: 0, staff: 0 });
  }

  async remove(actor: User, orgId: string, id: string) {
    const d = await this.prisma.department.findFirst({ where: { id, organizationId: orgId } });
    if (!d) throw new NotFoundException();
    await this.prisma.department.delete({ where: { id } }); // members keep their membership (department set to null)
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'department.deleted',
      entityType: 'department',
      entityId: id,
      meta: { name: d.name },
    });
  }

  /** e.g. MREC-ECE-7K2Q */
  private async newCode(orgSlug: string, deptName: string) {
    const org = orgSlug.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 6) || 'JOIN';
    const dept = deptName.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 5) || 'DEPT';
    for (let i = 0; i < 10; i++) {
      const suffix = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
      const code = `${org}-${dept}-${suffix}`;
      if (await joinCodeFree(this.prisma, code)) return code;
    }
    throw new Error('Could not generate a unique join code');
  }

  /** Opens / closes the department's own registration link (creating its code the first time). */
  async setJoin(actor: User, orgId: string, id: string, enabled: boolean, regenerate = false) {
    const d = await this.prisma.department.findFirst({
      where: { id, organizationId: orgId },
      include: { organization: { select: { slug: true } } },
    });
    if (!d) throw new NotFoundException();
    const joinCode =
      regenerate || !d.joinCode ? await this.newCode(d.organization.slug, d.name) : d.joinCode;
    const u = await this.prisma.department.update({
      where: { id },
      data: { joinEnabled: enabled, joinCode },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: regenerate
        ? 'department.join_link.regenerated'
        : enabled
          ? 'department.join_link.enabled'
          : 'department.join_link.disabled',
      entityType: 'department',
      entityId: id,
      meta: { name: d.name },
    });
    const by = await this.counts(orgId);
    return this.summary(u, by.get(u.id) ?? { members: 0, learners: 0, staff: 0 });
  }
}

const setJoinSchema = z.object({ enabled: z.boolean() });

@ApiTags('departments')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @RequirePermission('department.view')
  list(@OrgContext() org: OrgContextInfo) {
    return this.departments.list(org);
  }

  @Get(':id')
  @RequirePermission('department.view')
  detail(@OrgContext() org: OrgContextInfo, @Param('id', UuidPipe) id: string) {
    return this.departments.detail(org, id);
  }

  @Get(':id/students')
  @RequirePermission('department.view')
  students(@OrgContext() org: OrgContextInfo, @Param('id', UuidPipe) id: string) {
    return this.departments.students(org, id);
  }

  @Post()
  @RequirePermission('department.manage')
  create(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(createDepartmentSchema)) body: CreateDepartmentInput,
  ) {
    return this.departments.create(user, org.organizationId, body);
  }

  @Post(':id/join-link')
  @HttpCode(200)
  @RequirePermission('department.manage')
  setJoin(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(setJoinSchema)) body: { enabled: boolean },
  ) {
    return this.departments.setJoin(user, org.organizationId, id, body.enabled);
  }

  @Post(':id/join-link/regenerate')
  @HttpCode(200)
  @RequirePermission('department.manage')
  regenerate(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    return this.departments.setJoin(user, org.organizationId, id, true, true);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('department.manage')
  async remove(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    if (org.departmentId) throw new ForbiddenException();
    await this.departments.remove(user, org.organizationId, id);
  }
}
