import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { DuplicateGroup, MergeResult } from '@arc/types';
import type { MergeMembersInput } from '@arc/validation';
import type { OrgContextInfo } from '../auth/auth.types';
import { FIREBASE_AUTH } from '../auth/firebase-admin.provider';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normEmail, normRoll } from './identity';
import { memberInclude, toMember, type MemberRow } from './members.service';

/**
 * Finds students who registered more than once in a college (same roll number or college email)
 * and merges their accounts: exam attempts, lab marks and the rest move to the account kept.
 */
@Injectable()
export class MergeService {
  private readonly logger = new Logger(MergeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
  ) {}

  async duplicates(actor: User, org: OrgContextInfo): Promise<DuplicateGroup[]> {
    const orgId = org.organizationId;
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: memberInclude,
      orderBy: { joinedAt: 'asc' },
    });

    // Union people who share a roll number, a college email, or whose login email is someone
    // else's college email.
    const parent = new Map<string, string>(members.map((m) => [m.id, m.id]));
    const find = (x: string): string => {
      const p = parent.get(x)!;
      if (p === x) return x;
      const r = find(p);
      parent.set(x, r);
      return r;
    };
    const byKey = new Map<string, string>();
    const reasons = new Map<string, Set<string>>(); // member id → reasons
    const link = (key: string, label: string, m: MemberRow) => {
      const other = byKey.get(key);
      if (!other) return byKey.set(key, m.id);
      parent.set(find(m.id), find(other));
      for (const id of [m.id, other]) {
        const r = reasons.get(id) ?? new Set();
        r.add(label);
        reasons.set(id, r);
      }
    };
    for (const m of members) {
      const roll = normRoll(m.externalId);
      if (roll) link(`roll:${roll}`, `Roll no. ${roll}`, m);
      const ce = normEmail(m.collegeEmail);
      if (ce) link(`mail:${ce}`, `College email ${ce}`, m);
      const le = normEmail(m.user.email);
      if (le && le !== ce) link(`mail:${le}`, `College email ${le}`, m);
    }

    const groups = new Map<string, MemberRow[]>();
    for (const m of members) {
      const r = find(m.id);
      groups.set(r, [...(groups.get(r) ?? []), m]);
    }
    const dupGroups = [...groups.values()].filter((g) => g.length > 1);
    if (!dupGroups.length) return [];

    const userIds = dupGroups.flat().map((m) => m.userId);
    const [attempts, labMarks] = await Promise.all([
      this.prisma.quizAttempt.groupBy({
        by: ['userId'],
        where: { organizationId: orgId, userId: { in: userIds } },
        _count: { _all: true },
      }),
      this.prisma.labMark.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, assessment: { organizationId: orgId } },
        _count: { _all: true },
      }),
    ]);
    const count = (rows: { userId: string; _count: { _all: number } }[], id: string) =>
      rows.find((r) => r.userId === id)?._count._all ?? 0;

    return dupGroups.map((g) => {
      const rows = g.map((m) => ({
        ...toMember(m, actor.id),
        attempts: count(attempts, m.userId),
        labMarks: count(labMarks, m.userId),
      }));
      const keep = [...rows].sort(
        (a, b) =>
          b.attempts + b.labMarks - (a.attempts + a.labMarks) ||
          (b.lastLoginAt ?? '').localeCompare(a.lastLoginAt ?? '') ||
          a.joinedAt.localeCompare(b.joinedAt),
      )[0]!;
      const why = new Set<string>();
      for (const m of g) for (const r of reasons.get(m.id) ?? []) why.add(r);
      return { reasons: [...why], keepId: keep.id, members: rows };
    });
  }

  /**
   * Puts the "one roll number / one college email per college" rule into the database once no
   * college has duplicates left (the migration skips it while old duplicates exist).
   */
  async ensureUniqueRules() {
    const rules = [
      { name: 'organization_users_org_roll_key', column: 'externalId' },
      { name: 'organization_users_org_college_email_key', column: 'collegeEmail' },
    ] as const;
    for (const r of rules) {
      try {
        const exists = await this.prisma.$queryRawUnsafe<unknown[]>(
          `SELECT 1 FROM pg_indexes WHERE indexname = '${r.name}'`,
        );
        if (exists.length) continue;
        const dups = await this.prisma.$queryRawUnsafe<unknown[]>(
          `SELECT 1 FROM "organization_users" WHERE "${r.column}" IS NOT NULL
           GROUP BY "organizationId", "${r.column}" HAVING COUNT(*) > 1 LIMIT 1`,
        );
        if (dups.length) continue;
        await this.prisma.$executeRawUnsafe(
          `CREATE UNIQUE INDEX IF NOT EXISTS "${r.name}" ON "organization_users"
           ("organizationId", "${r.column}") WHERE "${r.column}" IS NOT NULL`,
        );
        this.logger.log(`Unique rule ${r.name} is now on`);
      } catch (e) {
        this.logger.warn(`Could not add ${r.name}: ${(e as Error).message}`);
      }
    }
  }

  async merge(actor: User, org: OrgContextInfo, input: MergeMembersInput): Promise<MergeResult> {
    const orgId = org.organizationId;
    const ids = [input.keepId, ...input.mergeIds];
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId, id: { in: ids } },
      include: memberInclude,
    });
    const keep = rows.find((r) => r.id === input.keepId);
    const dups = rows.filter((r) => input.mergeIds.includes(r.id));
    if (!keep || dups.length !== input.mergeIds.length) throw new NotFoundException();
    if (dups.some((d) => d.userId === actor.id))
      throw new BadRequestException({
        code: 'SELF_MERGE',
        message: 'Your own account can’t be merged into someone else’s',
      });
    if (dups.some((d) => d.userId === keep.userId))
      throw new ConflictException({ message: 'These are the same account' });

    const moved = { attempts: 0, labMarks: 0, other: 0 };
    const retired: string[] = []; // user ids left with no college at all

    await this.prisma.$transaction(
      async (tx) => {
        for (const d of dups) {
          const from = d.userId;
          const to = keep.userId;

          // Exam attempts: numbered after the kept account's attempts for the same exam.
          const atts = await tx.quizAttempt.findMany({
            where: { organizationId: orgId, userId: from },
            orderBy: [{ quizId: 'asc' }, { attemptNo: 'asc' }],
            select: { id: true, quizId: true },
          });
          const next = new Map<string, number>();
          for (const a of atts) {
            if (!next.has(a.quizId)) {
              const max = await tx.quizAttempt.aggregate({
                where: { quizId: a.quizId, userId: to },
                _max: { attemptNo: true },
              });
              next.set(a.quizId, (max._max.attemptNo ?? 0) + 1);
            }
            const n = next.get(a.quizId)!;
            await tx.quizAttempt.update({
              where: { id: a.id },
              data: { userId: to, attemptNo: n },
            });
            next.set(a.quizId, n + 1);
            moved.attempts++;
          }

          // Exams assigned to the person by name.
          for (const ea of await tx.examAudience.findMany({
            where: { userId: from, quiz: { organizationId: orgId } },
          })) {
            const has = await tx.examAudience.count({ where: { quizId: ea.quizId, userId: to } });
            if (has) await tx.examAudience.delete({ where: { id: ea.id } });
            else await tx.examAudience.update({ where: { id: ea.id }, data: { userId: to } });
            moved.other++;
          }

          // Lab marks: keep the kept account's marks unless they are empty.
          for (const lm of await tx.labMark.findMany({
            where: { userId: from, assessment: { organizationId: orgId } },
          })) {
            const key = { assessmentId: lm.assessmentId, userId: to };
            const mine = await tx.labMark.findUnique({ where: { assessmentId_userId: key } });
            const theirs = { assessmentId_userId: { assessmentId: lm.assessmentId, userId: from } };
            if (mine && (mine.total !== null || mine.absent)) {
              await tx.labMark.delete({ where: theirs });
              continue;
            }
            if (mine) await tx.labMark.delete({ where: { assessmentId_userId: key } });
            await tx.labMark.update({ where: theirs, data: { userId: to } });
            moved.labMarks++;
          }

          // Study-material activity: add the counts together.
          for (const ma of await tx.materialActivity.findMany({
            where: { userId: from, material: { organizationId: orgId } },
          })) {
            const k = { materialId: ma.materialId, userId: to };
            const mine = await tx.materialActivity.findUnique({ where: { materialId_userId: k } });
            if (mine) {
              await tx.materialActivity.update({
                where: { materialId_userId: k },
                data: {
                  views: mine.views + ma.views,
                  downloads: mine.downloads + ma.downloads,
                  firstAt: mine.firstAt < ma.firstAt ? mine.firstAt : ma.firstAt,
                  lastAt: mine.lastAt > ma.lastAt ? mine.lastAt : ma.lastAt,
                },
              });
              await tx.materialActivity.delete({
                where: { materialId_userId: { materialId: ma.materialId, userId: from } },
              });
            } else
              await tx.materialActivity.update({
                where: { materialId_userId: { materialId: ma.materialId, userId: from } },
                data: { userId: to },
              });
            moved.other++;
          }

          // Announcements they received.
          for (const ar of await tx.announcementRecipient.findMany({
            where: { userId: from, announcement: { organizationId: orgId } },
          })) {
            const k = { announcementId: ar.announcementId, userId: to };
            const has = await tx.announcementRecipient.count({ where: k });
            const theirs = {
              announcementId_userId: { announcementId: ar.announcementId, userId: from },
            };
            if (has) await tx.announcementRecipient.delete({ where: theirs });
            else await tx.announcementRecipient.update({ where: theirs, data: { userId: to } });
            moved.other++;
          }
          const n = await tx.notification.updateMany({
            where: { userId: from, organizationId: orgId },
            data: { userId: to },
          });
          moved.other += n.count;

          // Drop the duplicate membership first (its roll no. / college email must be free), then
          // fill in what the kept membership is missing.
          await tx.organizationMember.delete({ where: { id: d.id } });
          const cur = await tx.organizationMember.findUniqueOrThrow({ where: { id: keep.id } });
          await tx.organizationMember.update({
            where: { id: keep.id },
            data: {
              ...(!cur.externalId && d.externalId ? { externalId: normRoll(d.externalId) } : {}),
              ...(!cur.collegeEmail && d.collegeEmail
                ? { collegeEmail: normEmail(d.collegeEmail) }
                : {}),
              ...(!cur.departmentId && d.departmentId ? { departmentId: d.departmentId } : {}),
              roles: [...new Set([...cur.roles, ...d.roles])],
            },
          });

          const left = await tx.organizationMember.count({ where: { userId: from } });
          if (!left) {
            const u = await tx.user.findUniqueOrThrow({ where: { id: from } });
            if (!u.isSuperAdmin) {
              await tx.user.update({ where: { id: from }, data: { status: 'INACTIVE' } });
              retired.push(from);
            }
          }
          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              organizationId: orgId,
              action: 'member.merged',
              entityType: 'organization_member',
              entityId: keep.id,
              meta: {
                kept: { email: keep.user.email, name: keep.user.fullName },
                merged: {
                  email: d.user.email,
                  name: d.user.fullName,
                  externalId: d.externalId,
                  collegeEmail: d.collegeEmail,
                },
                accountClosed: !left,
              } as Prisma.InputJsonValue,
            },
          });
        }
      },
      { timeout: 60_000 },
    );

    // The extra logins can't be used any more (the person signs in with the kept account).
    for (const id of retired) {
      const u = await this.prisma.user.findUnique({ where: { id }, select: { firebaseUid: true } });
      if (!u?.firebaseUid) continue;
      try {
        await this.auth.updateUser(u.firebaseUid, { disabled: true });
      } catch (e) {
        if ((e as { code?: string }).code !== 'auth/user-not-found')
          this.logger.warn(`Could not disable login ${id}: ${(e as Error).message}`);
      }
    }

    await this.ensureUniqueRules();
    const kept = await this.prisma.organizationMember.findUniqueOrThrow({
      where: { id: keep.id },
      include: memberInclude,
    });
    return { merged: dups.length, moved, kept: toMember(kept, actor.id) };
  }
}
