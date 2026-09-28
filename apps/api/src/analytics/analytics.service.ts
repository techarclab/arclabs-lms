import { Injectable } from '@nestjs/common';
import type { ActivityItem, PlatformOverview } from '@arc/types';
import { PrismaService } from '../prisma/prisma.service';
import { toSummary } from '../organizations/organizations.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async platformOverview(): Promise<PlatformOverview> {
    const p = this.prisma;
    const [
      organizations,
      activeOrganizations,
      learners,
      instructors,
      publishedCourses,
      runningBatches,
      enrollments,
      completed,
      byType,
      recentOrgs,
      recentLogs,
    ] = await Promise.all([
      p.organization.count(),
      p.organization.count({ where: { status: 'ACTIVE' } }),
      p.organizationMember.count({ where: { status: 'ACTIVE', roles: { has: 'LEARNER' } } }),
      p.organizationMember.count({ where: { status: 'ACTIVE', roles: { has: 'INSTRUCTOR' } } }),
      p.course.count({ where: { status: 'PUBLISHED' } }),
      p.batch.count({ where: { status: 'ONGOING' } }),
      p.enrollment.count(),
      p.enrollment.count({ where: { status: 'COMPLETED' } }),
      p.organization.groupBy({ by: ['type'], _count: { _all: true } }),
      p.organization.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          status: true,
          primaryColor: true,
          contactEmail: true,
          createdAt: true,
          _count: { select: { members: true, courses: true, batches: true } },
        },
      }),
      p.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          actor: { select: { fullName: true } },
          organization: { select: { name: true } },
        },
      }),
    ]);

    const recentActivity: ActivityItem[] = recentLogs.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      actorName: l.actor?.fullName ?? null,
      organizationName: l.organization?.name ?? null,
      createdAt: l.createdAt.toISOString(),
      meta: (l.meta ?? {}) as Record<string, unknown>,
    }));

    return {
      totals: {
        organizations,
        activeOrganizations,
        learners,
        instructors,
        publishedCourses,
        runningBatches,
        enrollments,
        completionRate: enrollments ? Math.round((completed / enrollments) * 1000) / 10 : 0,
      },
      organizationsByType: Object.fromEntries(byType.map((b) => [b.type, b._count._all])),
      recentOrganizations: recentOrgs.map(toSummary),
      recentActivity,
    };
  }
}
