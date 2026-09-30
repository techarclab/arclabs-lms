import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  LabCriterion,
  LabSheet,
  LabSheetRow,
  LabStats,
  LabSummary,
  MyLabResult,
} from '@arc/types';
import type { CreateLabInput, SaveLabMarksInput, UpdateLabInput } from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import type { LabMark, Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const labInclude = {
  audiences: { include: { department: { select: { id: true, name: true } } } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.LabAssessmentInclude;
type LabRow = Prisma.LabAssessmentGetPayload<{ include: typeof labInclude }>;

const round2 = (n: number) => Math.round(n * 100) / 100;

function criteriaOf(lab: { criteria: unknown }): LabCriterion[] {
  return Array.isArray(lab.criteria) ? (lab.criteria as LabCriterion[]) : [];
}

function scoresOf(m: { scores: unknown } | undefined): Record<string, number | null> {
  return m && m.scores && typeof m.scores === 'object'
    ? (m.scores as Record<string, number | null>)
    : {};
}

/** Total of the entered marks for the current criteria; null when nothing is entered. */
function totalOf(criteria: LabCriterion[], scores: Record<string, number | null>, absent: boolean) {
  if (absent) return null;
  const vals = criteria.map((c) => scores[c.id]).filter((v): v is number => typeof v === 'number');
  return vals.length ? round2(vals.reduce((s, v) => s + v, 0)) : null;
}

function statsOf(
  criteria: LabCriterion[],
  students: number,
  marks: Pick<LabMark, 'scores' | 'absent' | 'total'>[],
): LabStats {
  const present = marks.filter((m) => !m.absent && m.total !== null);
  const totals = present.map((m) => m.total!);
  const criteriaAverage: Record<string, number | null> = {};
  for (const c of criteria) {
    const v = present
      .map((m) => scoresOf(m)[c.id])
      .filter((x): x is number => typeof x === 'number');
    criteriaAverage[c.id] = v.length ? round2(v.reduce((s, x) => s + x, 0) / v.length) : null;
  }
  return {
    students,
    marked: present.length,
    absent: marks.filter((m) => m.absent).length,
    average: totals.length ? round2(totals.reduce((s, x) => s + x, 0) / totals.length) : null,
    highest: totals.length ? Math.max(...totals) : null,
    lowest: totals.length ? Math.min(...totals) : null,
    criteriaAverage,
  };
}

@Injectable()
export class LabsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Learners this lab is for. */
  private learners(lab: {
    organizationId: string;
    assignToAll: boolean;
    audiences: { departmentId: string }[];
  }) {
    return this.prisma.organizationMember.findMany({
      where: {
        organizationId: lab.organizationId,
        status: 'ACTIVE',
        roles: { has: 'LEARNER' },
        user: { status: 'ACTIVE' },
        ...(lab.assignToAll
          ? {}
          : { departmentId: { in: lab.audiences.map((a) => a.departmentId) } }),
      },
      include: {
        user: { select: { id: true, fullName: true } },
        department: { select: { name: true } },
      },
    });
  }

  private summary(lab: LabRow, stats: LabStats): LabSummary {
    const criteria = criteriaOf(lab);
    return {
      id: lab.id,
      title: lab.title,
      description: lab.description,
      heldOn: lab.heldOn?.toISOString() ?? null,
      criteria,
      maxTotal: round2(criteria.reduce((s, c) => s + c.max, 0)),
      assignToAll: lab.assignToAll,
      departments: lab.audiences.map((a) => a.department),
      createdBy: lab.createdBy?.fullName ?? null,
      createdAt: lab.createdAt.toISOString(),
      stats,
    };
  }

  private async find(orgId: string, id: string) {
    const lab = await this.prisma.labAssessment.findFirst({
      where: { id, organizationId: orgId },
      include: labInclude,
    });
    if (!lab) throw new NotFoundException('Lab not found');
    return lab;
  }

  private async checkDepartments(orgId: string, ids?: string[]) {
    if (!ids?.length) return;
    const n = await this.prisma.department.count({
      where: { id: { in: ids }, organizationId: orgId },
    });
    if (n !== new Set(ids).size) throw new BadRequestException('Unknown department selected');
  }

  // ───────── Faculty ─────────

  async list(orgId: string): Promise<LabSummary[]> {
    const labs = await this.prisma.labAssessment.findMany({
      where: { organizationId: orgId },
      include: { ...labInclude, marks: { select: { scores: true, absent: true, total: true } } },
      orderBy: [{ heldOn: 'desc' }, { createdAt: 'desc' }],
    });
    // Student counts: one query for "all students", one per department set.
    const allCount = await this.prisma.organizationMember.count({
      where: {
        organizationId: orgId,
        status: 'ACTIVE',
        roles: { has: 'LEARNER' },
        user: { status: 'ACTIVE' },
      },
    });
    const byDept = await this.prisma.organizationMember.groupBy({
      by: ['departmentId'],
      where: {
        organizationId: orgId,
        status: 'ACTIVE',
        roles: { has: 'LEARNER' },
        user: { status: 'ACTIVE' },
      },
      _count: { _all: true },
    });
    const deptCount = new Map(byDept.map((d) => [d.departmentId, d._count._all]));
    return labs.map((lab) => {
      const students = lab.assignToAll
        ? allCount
        : lab.audiences.reduce((s, a) => s + (deptCount.get(a.departmentId) ?? 0), 0);
      return this.summary(lab, statsOf(criteriaOf(lab), students, lab.marks));
    });
  }

  async create(actor: User, orgId: string, input: CreateLabInput): Promise<LabSummary> {
    await this.checkDepartments(orgId, input.departmentIds);
    const lab = await this.prisma.labAssessment.create({
      data: {
        organizationId: orgId,
        title: input.title,
        description: input.description,
        heldOn: input.heldOn ? new Date(input.heldOn) : null,
        criteria: input.criteria,
        assignToAll: input.assignToAll,
        createdById: actor.id,
        audiences: input.assignToAll
          ? undefined
          : { create: [...new Set(input.departmentIds)].map((departmentId) => ({ departmentId })) },
      },
      include: labInclude,
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'lab.created',
      entityType: 'lab_assessment',
      entityId: lab.id,
      meta: { title: lab.title },
    });
    const students = (await this.learners(lab)).length;
    return this.summary(lab, statsOf(criteriaOf(lab), students, []));
  }

  async update(actor: User, orgId: string, id: string, input: UpdateLabInput): Promise<LabSheet> {
    const cur = await this.find(orgId, id);
    await this.checkDepartments(orgId, input.departmentIds);
    const assignToAll = input.assignToAll ?? cur.assignToAll;
    const audienceChanged = input.assignToAll !== undefined || input.departmentIds !== undefined;
    let deptIds: string[] = [];
    if (audienceChanged && !assignToAll) {
      deptIds = input.departmentIds
        ? [...new Set(input.departmentIds)]
        : cur.audiences.map((a) => a.departmentId);
      if (!deptIds.length) throw new BadRequestException('Choose at least one department');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.labAssessment.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          heldOn:
            input.heldOn === undefined ? undefined : input.heldOn ? new Date(input.heldOn) : null,
          criteria: input.criteria,
          assignToAll: input.assignToAll,
        },
      });
      if (audienceChanged) {
        await tx.labAssessmentAudience.deleteMany({ where: { assessmentId: id } });
        if (deptIds.length)
          await tx.labAssessmentAudience.createMany({
            data: deptIds.map((departmentId) => ({ assessmentId: id, departmentId })),
          });
      }
      // Criteria changed: totals are recalculated from the criteria that remain.
      if (input.criteria) {
        const marks = await tx.labMark.findMany({ where: { assessmentId: id } });
        for (const m of marks) {
          const total = totalOf(input.criteria, scoresOf(m), m.absent);
          if (total !== m.total)
            await tx.labMark.update({
              where: { assessmentId_userId: { assessmentId: id, userId: m.userId } },
              data: { total },
            });
        }
      }
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'lab.updated',
      entityType: 'lab_assessment',
      entityId: id,
      meta: { fields: Object.keys(input) },
    });
    return this.sheet(orgId, id);
  }

  async remove(actor: User, orgId: string, id: string) {
    const lab = await this.find(orgId, id);
    await this.prisma.labAssessment.delete({ where: { id } });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'lab.deleted',
      entityType: 'lab_assessment',
      entityId: id,
      meta: { title: lab.title },
    });
  }

  /** Mark sheet: every student the lab is for (and anyone already marked), with their marks. */
  async sheet(orgId: string, id: string): Promise<LabSheet> {
    const lab = await this.find(orgId, id);
    const criteria = criteriaOf(lab);
    const [learners, marks] = await Promise.all([
      this.learners(lab),
      this.prisma.labMark.findMany({
        where: { assessmentId: id },
        include: {
          user: {
            select: {
              fullName: true,
              memberships: {
                where: { organizationId: orgId },
                select: { externalId: true, department: { select: { name: true } } },
              },
            },
          },
        },
      }),
    ]);
    const byUser = new Map(marks.map((m) => [m.userId, m]));
    const row = (
      userId: string,
      fullName: string,
      externalId: string | null,
      department: string | null,
    ): LabSheetRow => {
      const m = byUser.get(userId);
      return {
        userId,
        fullName,
        externalId,
        department,
        scores: scoresOf(m),
        absent: m?.absent ?? false,
        remarks: m?.remarks ?? null,
        total: m ? totalOf(criteria, scoresOf(m), m.absent) : null,
        updatedAt: m?.updatedAt.toISOString() ?? null,
      };
    };
    const seen = new Set<string>();
    const rows: LabSheetRow[] = learners.map((l) => {
      seen.add(l.userId);
      return row(l.userId, l.user.fullName, l.externalId, l.department?.name ?? null);
    });
    for (const m of marks)
      if (!seen.has(m.userId)) {
        const ms = m.user.memberships[0];
        rows.push(
          row(m.userId, m.user.fullName, ms?.externalId ?? null, ms?.department?.name ?? null),
        );
      }
    rows.sort(
      (a, b) =>
        (a.department ?? '~').localeCompare(b.department ?? '~') ||
        (a.externalId ?? '~').localeCompare(b.externalId ?? '~', undefined, { numeric: true }) ||
        a.fullName.localeCompare(b.fullName),
    );
    return {
      ...this.summary(lab, statsOf(criteria, learners.length, marks)),
      rows,
    };
  }

  /** Saves one or more students' marks (the sheet autosaves row by row). */
  async saveMarks(actor: User, orgId: string, id: string, input: SaveLabMarksInput) {
    const lab = await this.find(orgId, id);
    const criteria = criteriaOf(lab);
    const max = new Map(criteria.map((c) => [c.id, c.max]));
    const allowed = new Set((await this.learners(lab)).map((l) => l.userId));
    const already = new Set(
      (
        await this.prisma.labMark.findMany({
          where: { assessmentId: id },
          select: { userId: true },
        })
      ).map((m) => m.userId),
    );
    for (const m of input.marks) {
      if (!allowed.has(m.userId) && !already.has(m.userId))
        throw new BadRequestException('A student in the list isn’t part of this lab');
      for (const [cid, v] of Object.entries(m.scores)) {
        const cap = max.get(cid);
        if (cap === undefined) throw new BadRequestException('Unknown criterion');
        if (v !== null && v > cap)
          throw new BadRequestException(
            `${criteria.find((c) => c.id === cid)!.text} is out of ${cap}`,
          );
      }
    }
    await this.prisma.$transaction(
      input.marks.map((m) => {
        const scores = Object.fromEntries(criteria.map((c) => [c.id, m.scores[c.id] ?? null]));
        const total = totalOf(criteria, scores, m.absent);
        const data = { scores, absent: m.absent, remarks: m.remarks, total, gradedById: actor.id };
        return this.prisma.labMark.upsert({
          where: { assessmentId_userId: { assessmentId: id, userId: m.userId } },
          create: { assessmentId: id, userId: m.userId, ...data },
          update: data,
        });
      }),
    );
    const marks = await this.prisma.labMark.findMany({
      where: { assessmentId: id },
      select: { scores: true, absent: true, total: true },
    });
    return {
      saved: input.marks.length,
      stats: statsOf(criteria, allowed.size, marks),
    };
  }

  async csv(orgId: string, id: string) {
    const s = await this.sheet(orgId, id);
    const q = (v: string | number | null | undefined) => {
      const t = String(v ?? '');
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = [
      [
        'Name',
        'Roll no.',
        'Department',
        ...s.criteria.map((c) => `${c.text} (/${c.max})`),
        `Total (/${s.maxTotal})`,
        'Percent',
        'Status',
        'Remarks',
      ],
      ...s.rows.map((r) => [
        r.fullName,
        r.externalId,
        r.department,
        ...s.criteria.map((c) => r.scores[c.id] ?? ''),
        r.total ?? '',
        r.total !== null && s.maxTotal ? `${round2((r.total / s.maxTotal) * 100)}%` : '',
        r.absent ? 'Absent' : r.total === null ? 'Not marked' : 'Marked',
        r.remarks,
      ]),
      [],
      [
        'Class average',
        '',
        '',
        ...s.criteria.map((c) => s.stats.criteriaAverage[c.id] ?? ''),
        s.stats.average ?? '',
        s.stats.average !== null && s.maxTotal
          ? `${round2((s.stats.average / s.maxTotal) * 100)}%`
          : '',
        `${s.stats.marked} marked, ${s.stats.absent} absent`,
        '',
      ],
    ].map((row) => row.map(q).join(','));
    return {
      filename: `${s.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'lab'}-marks.csv`,
      body: '﻿' + lines.join('\n'), // BOM so Excel reads UTF-8
    };
  }

  // ───────── Students ─────────

  /** Labs this student has been marked in, with the class average. */
  async mine(user: User): Promise<MyLabResult[]> {
    const marks = await this.prisma.labMark.findMany({
      where: {
        userId: user.id,
        assessment: {
          organization: {
            status: 'ACTIVE',
            members: { some: { userId: user.id, status: 'ACTIVE', roles: { has: 'LEARNER' } } },
          },
        },
      },
      include: {
        assessment: {
          include: {
            organization: { select: { name: true } },
            marks: { select: { absent: true, total: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return marks.map((m) => {
      const a = m.assessment;
      const criteria = criteriaOf(a);
      const totals = a.marks.filter((x) => !x.absent && x.total !== null).map((x) => x.total!);
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        heldOn: a.heldOn?.toISOString() ?? null,
        organizationName: a.organization.name,
        criteria,
        maxTotal: round2(criteria.reduce((s, c) => s + c.max, 0)),
        scores: scoresOf(m),
        absent: m.absent,
        remarks: m.remarks,
        total: totalOf(criteria, scoresOf(m), m.absent),
        classAverage: totals.length
          ? round2(totals.reduce((s, x) => s + x, 0) / totals.length)
          : null,
        highest: totals.length ? Math.max(...totals) : null,
        updatedAt: m.updatedAt.toISOString(),
      };
    });
  }
}
