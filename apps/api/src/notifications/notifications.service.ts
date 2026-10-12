import { Injectable } from '@nestjs/common';
import {
  hasPermission,
  type NotificationFeed,
  type NotificationItem,
  type OrgRole,
} from '@arc/types';
import { departmentScope } from '../auth/tenant.guard';
import type { Prisma, User } from '../generated/prisma/client';
import { AttemptsService } from '../exams/attempts.service';
import { ExamsService } from '../exams/exams.service';
import { PrismaService } from '../prisma/prisma.service';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * The bell in the top bar. Nothing is stored per item: the feed is built from announcements,
 * exams and results, and anything newer than the last time the bell was opened is unread.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: AttemptsService,
    private readonly exams: ExamsService,
  ) {}

  async feed(user: User): Promise<NotificationFeed> {
    const now = new Date();
    const seen = (
      await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { notificationsSeenAt: true },
      })
    )?.notificationsSeenAt;
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: user.id, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
      select: { organizationId: true, roles: true, departmentId: true },
    });
    const learner = memberships.some((m) => m.roles.includes('LEARNER'));
    const staff = memberships.filter((m) =>
      hasPermission(m.roles as OrgRole[], 'exam.results.view'),
    );

    const items: NotificationItem[] = [];
    if (learner) items.push(...(await this.learnerItems(user, now)));
    items.push(...(await this.announcementItems(user, now)));
    if (staff.length || user.isSuperAdmin) items.push(...(await this.staffItems(user, staff, now)));

    const unique = [...new Map(items.map((i) => [i.id, i])).values()]
      .map((i) => ({ ...i, unread: !seen || new Date(i.at) > seen }))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 30);
    return { items: unique, unread: unique.filter((i) => i.unread).length };
  }

  async markSeen(user: User) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { notificationsSeenAt: new Date() },
    });
    return { ok: true };
  }

  private async announcementItems(user: User, now: Date): Promise<NotificationItem[]> {
    const rows = await this.prisma.announcementRecipient.findMany({
      where: {
        userId: user.id,
        announcement: {
          createdAt: { gte: new Date(now.getTime() - 30 * DAY) },
          organization: { status: 'ACTIVE' },
        },
      },
      select: {
        announcement: { select: { id: true, subject: true, body: true, createdAt: true } },
      },
      orderBy: { announcement: { createdAt: 'desc' } },
      take: 15,
    });
    return rows.map(({ announcement: a }) => ({
      id: `ann:${a.id}`,
      kind: 'ANNOUNCEMENT',
      title: a.subject,
      body: a.body.length > 140 ? `${a.body.slice(0, 140)}…` : a.body,
      link: '/my-announcements',
      at: a.createdAt.toISOString(),
      unread: false,
    }));
  }

  /** Students: exams live now or starting soon, and new results. */
  private async learnerItems(user: User, now: Date): Promise<NotificationItem[]> {
    const exams = await this.attempts.listMine(user, {
      from: new Date(now.getTime() - 14 * DAY),
      to: new Date(now.getTime() + 2 * DAY),
    });
    const out: NotificationItem[] = [];
    for (const e of exams) {
      const starts = e.startsAt ? new Date(e.startsAt) : null;
      const ends = e.endsAt ? new Date(e.endsAt) : null;
      if (e.state === 'LIVE' && e.canStart && !e.lastAttempt)
        out.push({
          id: `live:${e.id}`,
          kind: 'EXAM_LIVE',
          title: `Exam is live: ${e.title}`,
          body: ends ? `Closes ${fmt(ends)}` : 'Open now',
          link: `/exam/${e.id}`,
          at: (starts ?? now).toISOString(),
          unread: false,
        });
      else if (e.state === 'SCHEDULED' && starts)
        out.push({
          id: `soon:${e.id}`,
          kind: 'EXAM_SOON',
          title: `Upcoming exam: ${e.title}`,
          body: `Starts ${fmt(starts)}`,
          link: `/exam/${e.id}`,
          at: new Date(Math.max(starts.getTime() - 2 * DAY, 0)).toISOString(),
          unread: false,
        });
      const last = e.lastAttempt;
      if (last?.resultVisible && last.percentage !== null && last.submittedAt) {
        const submitted = new Date(last.submittedAt);
        // Results hidden until the exam closes appear when it closes.
        const at = ends && ends > submitted && ends <= now ? ends : submitted;
        if (now.getTime() - at.getTime() <= 14 * DAY)
          out.push({
            id: `result:${last.id}`,
            kind: 'RESULT',
            title: `Result: ${e.title}`,
            body: `${last.score} / ${e.totalMarks} · ${last.percentage}%${
              last.passed === null ? '' : last.passed ? ' · Pass' : ' · Fail'
            }`,
            link: `/my-exams/result/${last.id}`,
            at: at.toISOString(),
            unread: false,
          });
      }
    }
    return out;
  }

  /** Faculty: exams live now, and finished exams with coding answers waiting to be marked. */
  private async staffItems(
    user: User,
    memberships: { organizationId: string; roles: string[]; departmentId: string | null }[],
    now: Date,
  ): Promise<NotificationItem[]> {
    const scopes: Prisma.QuizWhereInput[] = memberships.map((m) => {
      const dept = departmentScope(m.roles as OrgRole[], m.departmentId);
      return {
        organizationId: m.organizationId,
        ...(dept
          ? this.exams.scopeWhere(
              { organizationId: m.organizationId, roles: [], departmentId: dept },
              user.id,
            )
          : {}),
      };
    });
    if (!scopes.length && !user.isSuperAdmin) return [];
    const base: Prisma.QuizWhereInput = {
      status: 'PUBLISHED',
      courseId: null,
      ...(user.isSuperAdmin && !scopes.length ? {} : { OR: scopes }),
    };
    const [live, ended] = await Promise.all([
      this.prisma.quiz.findMany({
        where: { ...base, startsAt: { lte: now }, endsAt: { gt: now } },
        select: { id: true, title: true, startsAt: true, endsAt: true },
        take: 10,
      }),
      this.prisma.quiz.findMany({
        where: {
          ...base,
          endsAt: { lte: now, gte: new Date(now.getTime() - 7 * DAY) },
          attempts: { some: { status: 'GRADED', codingPending: true, voidedAt: null } },
        },
        select: { id: true, title: true, endsAt: true },
        take: 10,
      }),
    ]);
    const writing = live.length
      ? await this.prisma.quizAttempt.groupBy({
          by: ['quizId'],
          where: { quizId: { in: live.map((e) => e.id) }, status: 'IN_PROGRESS' },
          _count: { _all: true },
        })
      : [];
    const pending = ended.length
      ? await this.prisma.quizAttempt.groupBy({
          by: ['quizId'],
          where: {
            quizId: { in: ended.map((e) => e.id) },
            status: 'GRADED',
            codingPending: true,
            voidedAt: null,
          },
          _count: { _all: true },
        })
      : [];
    const count = (rows: { quizId: string; _count: { _all: number } }[], id: string) =>
      rows.find((r) => r.quizId === id)?._count._all ?? 0;
    return [
      ...live.map((e) => ({
        id: `slive:${e.id}`,
        kind: 'STAFF_EXAM_LIVE' as const,
        title: `Live now: ${e.title}`,
        body: `${count(writing, e.id)} writing · closes ${fmt(e.endsAt!)}`,
        link: `/exams/${e.id}/results`,
        at: e.startsAt!.toISOString(),
        unread: false,
      })),
      ...ended.map((e) => {
        const n = count(pending, e.id);
        return {
          id: `mark:${e.id}`,
          kind: 'STAFF_MARKING' as const,
          title: `Coding answers to mark: ${e.title}`,
          body: `${n} submission${n === 1 ? '' : 's'} waiting — open Results and click Evaluate`,
          link: `/exams/${e.id}/results`,
          at: e.endsAt!.toISOString(),
          unread: false,
        };
      }),
    ];
  }
}

/** "12 Oct, 2:40 pm" in Indian time. */
function fmt(d: Date) {
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
