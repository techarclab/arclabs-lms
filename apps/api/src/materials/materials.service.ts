import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  materialLink,
  type MaterialActivityReport,
  type MaterialActivityRow,
  type MaterialAdminItem,
  type MaterialFolderItem,
  type MaterialLibrary,
  type MaterialLinkInfo,
  type MaterialStudentItem,
  type MaterialType,
} from '@arc/types';
import type {
  CreateMaterialInput,
  MaterialFolderInput,
  UpdateMaterialInput,
} from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import type { Material, Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type LinkAccess = 'public' | 'private' | 'not-found' | 'unknown';

const adminInclude = {
  audiences: { include: { department: { select: { id: true, name: true } } } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.MaterialInclude;
type AdminRow = Prisma.MaterialGetPayload<{ include: typeof adminInclude }>;

function typeOf(m: Pick<Material, 'fileType'>, link: MaterialLinkInfo): MaterialType {
  return (m.fileType as MaterialType | null) ?? link.type;
}

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────── Link check (Google links must be shared "Anyone with the link") ─────────

  async checkLink(url: string): Promise<{ link: MaterialLinkInfo; access: LinkAccess }> {
    const link = materialLink(url);
    return { link, access: await this.access(link) };
  }

  private async access(link: MaterialLinkInfo): Promise<LinkAccess> {
    if (link.provider !== 'google-drive' && link.provider !== 'google-docs') return 'unknown';
    try {
      const res = await fetch(link.embedUrl ?? link.openUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
        headers: { 'user-agent': 'Mozilla/5.0 (ARC LABS link check)' },
      });
      const to = res.headers.get('location') ?? '';
      if (res.status >= 300 && res.status < 400 && /accounts\.google\.com|ServiceLogin/.test(to))
        return 'private';
      if (res.status === 404) return 'not-found';
      if (res.ok) return 'public';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // ───────── Admin: folders ─────────

  private async folders(orgId: string): Promise<MaterialFolderItem[]> {
    const rows = await this.prisma.materialFolder.findMany({
      where: { organizationId: orgId },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return rows.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, position: f.position }));
  }

  async createFolder(actor: User, orgId: string, input: MaterialFolderInput) {
    if (input.parentId) {
      const parent = await this.prisma.materialFolder.findFirst({
        where: { id: input.parentId, organizationId: orgId },
      });
      if (!parent) throw new NotFoundException('Subject not found');
      if (parent.parentId) throw new BadRequestException('Units can’t contain more folders');
    }
    const last = await this.prisma.materialFolder.aggregate({
      where: { organizationId: orgId, parentId: input.parentId ?? null },
      _max: { position: true },
    });
    const f = await this.prisma.materialFolder.create({
      data: {
        organizationId: orgId,
        parentId: input.parentId ?? null,
        name: input.name,
        position: (last._max.position ?? -1) + 1,
      },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'material.folder.created',
      entityType: 'material_folder',
      entityId: f.id,
      meta: { name: f.name },
    });
    return { id: f.id, name: f.name, parentId: f.parentId, position: f.position };
  }

  async renameFolder(orgId: string, id: string, name: string) {
    const f = await this.prisma.materialFolder.findFirst({ where: { id, organizationId: orgId } });
    if (!f) throw new NotFoundException();
    const u = await this.prisma.materialFolder.update({ where: { id }, data: { name } });
    return { id: u.id, name: u.name, parentId: u.parentId, position: u.position };
  }

  /** Deletes a subject/unit. Its materials are kept and become "Not in a folder". */
  async deleteFolder(actor: User, orgId: string, id: string) {
    const f = await this.prisma.materialFolder.findFirst({ where: { id, organizationId: orgId } });
    if (!f) throw new NotFoundException();
    await this.prisma.materialFolder.delete({ where: { id } });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'material.folder.deleted',
      entityType: 'material_folder',
      entityId: id,
      meta: { name: f.name },
    });
  }

  // ───────── Admin: materials ─────────

  async library(orgId: string): Promise<MaterialLibrary<MaterialAdminItem>> {
    const [folders, rows, stats] = await Promise.all([
      this.folders(orgId),
      this.prisma.material.findMany({
        where: { organizationId: orgId },
        include: adminInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.materialActivity.groupBy({
        by: ['materialId'],
        where: { material: { organizationId: orgId } },
        _count: { userId: true },
        _sum: { views: true, downloads: true },
      }),
    ]);
    const byId = new Map(stats.map((s) => [s.materialId, s]));
    return {
      folders,
      materials: rows.map((m) => {
        const s = byId.get(m.id);
        return this.adminItem(m, {
          viewers: s?._count.userId ?? 0,
          views: s?._sum.views ?? 0,
          downloads: s?._sum.downloads ?? 0,
        });
      }),
    };
  }

  private adminItem(m: AdminRow, stats: MaterialAdminItem['stats']): MaterialAdminItem {
    const link = materialLink(m.url);
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      folderId: m.folderId,
      type: typeOf(m, link),
      link,
      url: m.url,
      allowDownload: m.allowDownload,
      published: m.published,
      assignToAll: m.assignToAll,
      departments: m.audiences.map((a) => a.department),
      createdBy: m.createdBy?.fullName ?? null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      stats,
    };
  }

  private async checkRefs(orgId: string, folderId?: string | null, departmentIds?: string[]) {
    if (folderId) {
      const f = await this.prisma.materialFolder.count({ where: { id: folderId, organizationId: orgId } });
      if (!f) throw new BadRequestException('That folder doesn’t exist');
    }
    if (departmentIds?.length) {
      const n = await this.prisma.department.count({
        where: { id: { in: departmentIds }, organizationId: orgId },
      });
      if (n !== new Set(departmentIds).size)
        throw new BadRequestException('Unknown department selected');
    }
  }

  async create(actor: User, orgId: string, input: CreateMaterialInput) {
    await this.checkRefs(orgId, input.folderId, input.departmentIds);
    const m = await this.prisma.material.create({
      data: {
        organizationId: orgId,
        folderId: input.folderId ?? null,
        title: input.title,
        description: input.description,
        url: input.url,
        fileType: input.fileType ?? null,
        allowDownload: input.allowDownload,
        published: input.published,
        assignToAll: input.assignToAll,
        createdById: actor.id,
        audiences: input.assignToAll
          ? undefined
          : { create: [...new Set(input.departmentIds)].map((departmentId) => ({ departmentId })) },
      },
      include: adminInclude,
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'material.created',
      entityType: 'material',
      entityId: m.id,
      meta: { title: m.title },
    });
    const link = materialLink(m.url);
    return {
      ...this.adminItem(m, { viewers: 0, views: 0, downloads: 0 }),
      access: await this.access(link),
    };
  }

  async update(actor: User, orgId: string, id: string, input: UpdateMaterialInput) {
    const cur = await this.prisma.material.findFirst({ where: { id, organizationId: orgId } });
    if (!cur) throw new NotFoundException();
    await this.checkRefs(orgId, input.folderId, input.departmentIds);
    const assignToAll = input.assignToAll ?? cur.assignToAll;
    const audienceChanged = input.assignToAll !== undefined || input.departmentIds !== undefined;
    let deptIds: string[] = [];
    if (audienceChanged && !assignToAll) {
      deptIds = input.departmentIds
        ? [...new Set(input.departmentIds)]
        : (await this.prisma.materialAudience.findMany({ where: { materialId: id } })).map(
            (a) => a.departmentId,
          );
      if (!deptIds.length)
        throw new BadRequestException('Choose at least one department, or share with all students');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.material.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          url: input.url,
          fileType: input.fileType,
          folderId: input.folderId,
          allowDownload: input.allowDownload,
          published: input.published,
          assignToAll: input.assignToAll,
        },
      });
      if (audienceChanged) {
        await tx.materialAudience.deleteMany({ where: { materialId: id } });
        if (deptIds.length)
          await tx.materialAudience.createMany({
            data: deptIds.map((departmentId) => ({ materialId: id, departmentId })),
          });
      }
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'material.updated',
      entityType: 'material',
      entityId: id,
      meta: { fields: Object.keys(input) },
    });
    const m = await this.prisma.material.findUniqueOrThrow({ where: { id }, include: adminInclude });
    const s = await this.prisma.materialActivity.aggregate({
      where: { materialId: id },
      _count: { userId: true },
      _sum: { views: true, downloads: true },
    });
    return {
      ...this.adminItem(m, {
        viewers: s._count.userId,
        views: s._sum.views ?? 0,
        downloads: s._sum.downloads ?? 0,
      }),
      access: input.url ? await this.access(materialLink(m.url)) : ('unknown' as LinkAccess),
    };
  }

  async remove(actor: User, orgId: string, id: string) {
    const m = await this.prisma.material.findFirst({ where: { id, organizationId: orgId } });
    if (!m) throw new NotFoundException();
    await this.prisma.material.delete({ where: { id } });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'material.deleted',
      entityType: 'material',
      entityId: id,
      meta: { title: m.title },
    });
  }

  /** Who the material is shared with, who opened it and who hasn't yet. */
  async activity(orgId: string, id: string): Promise<MaterialActivityReport> {
    const m = await this.prisma.material.findFirst({
      where: { id, organizationId: orgId },
      include: { audiences: true, activity: true },
    });
    if (!m) throw new NotFoundException();
    const deptIds = m.audiences.map((a) => a.departmentId);
    const learners = await this.prisma.organizationMember.findMany({
      where: {
        organizationId: orgId,
        status: 'ACTIVE',
        roles: { has: 'LEARNER' },
        user: { status: 'ACTIVE' },
        ...(m.assignToAll ? {} : { departmentId: { in: deptIds } }),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        department: { select: { name: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    });
    const act = new Map(m.activity.map((a) => [a.userId, a]));
    const row = (l: (typeof learners)[number]): MaterialActivityRow => {
      const a = act.get(l.userId);
      return {
        userId: l.userId,
        fullName: l.user.fullName,
        email: l.user.email,
        externalId: l.externalId,
        department: l.department?.name ?? null,
        views: a?.views ?? 0,
        downloads: a?.downloads ?? 0,
        lastAt: a?.lastAt.toISOString() ?? null,
      };
    };
    const opened = learners
      .filter((l) => act.has(l.userId))
      .map(row)
      .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
    return {
      materialId: m.id,
      title: m.title,
      assigned: learners.length,
      opened,
      notOpened: learners.filter((l) => !act.has(l.userId)).map(row),
    };
  }

  // ───────── Students ─────────

  /** Learner memberships of this user (organization + department). */
  private async learnerMemberships(user: User) {
    return this.prisma.organizationMember.findMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        roles: { has: 'LEARNER' },
        organization: { status: 'ACTIVE' },
      },
      select: { organizationId: true, departmentId: true, organization: { select: { name: true } } },
    });
  }

  private visibleWhere(
    memberships: Awaited<ReturnType<MaterialsService['learnerMemberships']>>,
  ): Prisma.MaterialWhereInput {
    return {
      published: true,
      OR: memberships.map((m) => ({
        organizationId: m.organizationId,
        OR: [
          { assignToAll: true },
          ...(m.departmentId ? [{ audiences: { some: { departmentId: m.departmentId } } }] : []),
        ],
      })),
    };
  }

  async myLibrary(user: User): Promise<MaterialLibrary<MaterialStudentItem>> {
    const memberships = await this.learnerMemberships(user);
    if (!memberships.length) return { folders: [], materials: [] };
    const orgName = new Map(memberships.map((m) => [m.organizationId, m.organization.name]));
    const rows = await this.prisma.material.findMany({
      where: this.visibleWhere(memberships),
      include: { activity: { where: { userId: user.id } } },
      orderBy: { createdAt: 'desc' },
    });
    // Only the folders (and their subjects) that hold something this student can see.
    const used = new Set(rows.map((r) => r.folderId).filter((x): x is string => Boolean(x)));
    const all = await this.prisma.materialFolder.findMany({
      where: { organizationId: { in: memberships.map((m) => m.organizationId) } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    const parentOf = new Map(all.map((f) => [f.id, f.parentId]));
    for (const id of [...used]) {
      const p = parentOf.get(id);
      if (p) used.add(p);
    }
    return {
      folders: all
        .filter((f) => used.has(f.id))
        .map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, position: f.position })),
      materials: rows.map((m) => {
        const link = materialLink(m.url);
        const a = m.activity[0];
        return {
          id: m.id,
          title: m.title,
          description: m.description,
          folderId: m.folderId,
          type: typeOf(m, link),
          link: m.allowDownload ? link : { ...link, downloadUrl: null },
          allowDownload: m.allowDownload,
          organizationName: orgName.get(m.organizationId) ?? '',
          viewed: (a?.views ?? 0) > 0,
          downloaded: (a?.downloads ?? 0) > 0,
          createdAt: m.createdAt.toISOString(),
          updatedAt: m.updatedAt.toISOString(),
        };
      }),
    };
  }

  /** Records a view/download and returns where to go. */
  async open(user: User, id: string, action: 'view' | 'download') {
    const memberships = await this.learnerMemberships(user);
    const m = memberships.length
      ? await this.prisma.material.findFirst({
          where: { AND: [{ id }, this.visibleWhere(memberships)] },
        })
      : null;
    if (!m) throw new NotFoundException('This material isn’t shared with you');
    const link = materialLink(m.url);
    if (action === 'download' && (!m.allowDownload || !link.downloadUrl))
      throw new ForbiddenException('Downloading this material isn’t allowed');
    const now = new Date();
    await this.prisma.materialActivity.upsert({
      where: { materialId_userId: { materialId: id, userId: user.id } },
      create: {
        materialId: id,
        userId: user.id,
        views: action === 'view' ? 1 : 0,
        downloads: action === 'download' ? 1 : 0,
        firstAt: now,
        lastAt: now,
      },
      update: {
        views: action === 'view' ? { increment: 1 } : undefined,
        downloads: action === 'download' ? { increment: 1 } : undefined,
        lastAt: now,
      },
    });
    return { url: action === 'download' ? link.downloadUrl! : link.openUrl };
  }
}
