import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrganizationDetail, OrganizationSummary, OrgRole, Paginated } from '@arc/types';
import { hasPermission } from '@arc/types';
import type {
  CreateOrganizationInput,
  ListOrganizationsQuery,
  SetOrganizationStatusInput,
  UpdateOrganizationInput,
} from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const summarySelect = {
  id: true,
  name: true,
  slug: true,
  type: true,
  status: true,
  primaryColor: true,
  contactEmail: true,
  createdAt: true,
  _count: { select: { members: true, courses: true, batches: true } },
} satisfies Prisma.OrganizationSelect;

type SummaryRow = Prisma.OrganizationGetPayload<{ select: typeof summarySelect }>;

export function toSummary(o: SummaryRow): OrganizationSummary {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    type: o.type,
    status: o.status,
    primaryColor: o.primaryColor,
    contactEmail: o.contactEmail,
    createdAt: o.createdAt.toISOString(),
    counts: { members: o._count.members, courses: o._count.courses, batches: o._count.batches },
  };
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: User, q: ListOrganizationsQuery): Promise<Paginated<OrganizationSummary>> {
    const where: Prisma.OrganizationWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { slug: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      // Non super admins only ever see organizations they belong to.
      ...(user.isSuperAdmin ? {} : { members: { some: { userId: user.id, status: 'ACTIVE' } } }),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        select: summarySelect,
        orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { data: rows.map(toSummary), meta: { page: q.page, pageSize: q.pageSize, total } };
  }

  async create(actor: User, input: CreateOrganizationInput): Promise<OrganizationSummary> {
    const org = await this.prisma.organization.create({
      data: {
        name: input.name,
        slug: input.slug,
        type: input.type ?? 'OTHER',
        contactEmail: input.contactEmail || null,
        primaryColor: input.primaryColor || null,
      },
      select: summarySelect,
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: org.id,
      action: 'organization.created',
      entityType: 'organization',
      entityId: org.id,
      meta: { name: org.name },
    });
    return toSummary(org);
  }

  async get(user: User, id: string): Promise<OrganizationDetail> {
    const roles = await this.rolesIn(user, id);
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { ...summarySelect, updatedAt: true },
    });
    if (!org) throw new NotFoundException();

    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: id, status: 'ACTIVE' },
      select: { roles: true },
    });
    const roleBreakdown: Record<string, number> = {};
    for (const m of members)
      for (const r of m.roles) roleBreakdown[r] = (roleBreakdown[r] ?? 0) + 1;

    return {
      ...toSummary(org),
      updatedAt: org.updatedAt.toISOString(),
      roleBreakdown,
      myRoles: roles,
      canManage: user.isSuperAdmin || hasPermission(roles, 'org.settings.manage'),
    };
  }

  async update(
    user: User,
    id: string,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationDetail> {
    const roles = await this.rolesIn(user, id);
    if (!user.isSuperAdmin && !hasPermission(roles, 'org.settings.manage')) {
      throw new ForbiddenException({ message: 'Missing permission: org.settings.manage' });
    }
    await this.prisma.organization.update({ where: { id }, data: input });
    await this.audit.log({
      actorId: user.id,
      organizationId: id,
      action: 'organization.updated',
      entityType: 'organization',
      entityId: id,
      meta: { fields: Object.keys(input) },
    });
    return this.get(user, id);
  }

  async setStatus(actor: User, id: string, input: SetOrganizationStatusInput) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { type: true },
    });
    if (!org) throw new NotFoundException();
    if (org.type === 'PLATFORM' && input.status !== 'ACTIVE') {
      throw new ForbiddenException({ message: 'The platform organization cannot be suspended' });
    }
    await this.prisma.organization.update({ where: { id }, data: { status: input.status } });
    await this.audit.log({
      actorId: actor.id,
      organizationId: id,
      action: `organization.status.${input.status.toLowerCase()}`,
      entityType: 'organization',
      entityId: id,
      meta: { reason: input.reason },
    });
    return this.get(actor, id);
  }

  /** Roles of the user in the org. Throws 404 (not 403) when the user may not see it. */
  private async rolesIn(user: User, orgId: string): Promise<OrgRole[]> {
    if (user.isSuperAdmin) return ['ORG_ADMIN'];
    const m = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
      select: { roles: true, status: true },
    });
    if (!m || m.status !== 'ACTIVE') throw new NotFoundException();
    return m.roles as OrgRole[];
  }
}
