import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AnnouncementAudience,
  AnnouncementItem,
  AudiencePreview,
  MyAnnouncement,
} from '@arc/types';
import { emailOnDomains, type AnnouncementInput } from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import type { Prisma, User } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { announcementEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';

/** Recipients per email (Bcc). Gmail / most SMTP servers allow up to 100. */
const BATCH = 90;

type Target = {
  userId: string;
  name: string;
  externalId: string | null;
  email: string;
  college: boolean;
};

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get web() {
    return this.env.WEB_ORIGIN.split(',')[0]!.trim().replace(/\/$/, '');
  }

  /** Students the message goes to, each with the email to use (college email first). */
  /** Department faculty may message only their own department (whole dept or an exam's students in it). */
  private assertScope(departmentId: string | null | undefined, audience: AnnouncementAudience) {
    if (!departmentId) return;
    if (
      audience.type === 'all' ||
      (audience.type === 'departments' && audience.departmentIds.some((d) => d !== departmentId))
    )
      throw new ForbiddenException({
        code: 'OTHER_DEPARTMENTS',
        message: 'You can send announcements only to students of your department.',
      });
  }

  private async targets(
    orgId: string,
    audience: AnnouncementAudience,
    departmentId?: string | null,
  ): Promise<Target[]> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { collegeEmailDomains: true },
    });
    const base: Prisma.OrganizationMemberWhereInput = {
      organizationId: orgId,
      status: 'ACTIVE',
      user: { status: 'ACTIVE' },
    };
    let where: Prisma.OrganizationMemberWhereInput;
    if (audience.type === 'all') where = { ...base, roles: { has: 'LEARNER' } };
    else if (audience.type === 'departments')
      where = { ...base, roles: { has: 'LEARNER' }, departmentId: { in: audience.departmentIds } };
    else {
      const exam = await this.prisma.quiz.findFirst({
        where: { id: audience.examId, organizationId: orgId },
        include: { audiences: true },
      });
      if (!exam) throw new NotFoundException('Exam not found');
      const deptIds = exam.audiences.map((a) => a.departmentId).filter((x): x is string => !!x);
      const userIds = exam.audiences.map((a) => a.userId).filter((x): x is string => !!x);
      const or: Prisma.OrganizationMemberWhereInput[] = [];
      if (exam.assignToAll) or.push({ roles: { has: 'LEARNER' } });
      if (deptIds.length) or.push({ departmentId: { in: deptIds }, roles: { has: 'LEARNER' } });
      if (userIds.length) or.push({ userId: { in: userIds } });
      if (!or.length) return [];
      where = { ...base, OR: or };
      if (audience.pendingOnly)
        where.user = {
          status: 'ACTIVE',
          quizAttempts: { none: { quizId: exam.id, status: { in: ['SUBMITTED', 'GRADED'] } } },
        };
    }
    if (departmentId) where = { ...where, departmentId };
    const members = await this.prisma.organizationMember.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });
    const domains = org.collegeEmailDomains;
    return members.map((m) => {
      const loginIsCollege = domains.length > 0 && emailOnDomains(m.user.email, domains);
      const email = m.collegeEmail ?? m.user.email;
      return {
        userId: m.userId,
        name: m.user.fullName,
        externalId: m.externalId,
        email,
        college: Boolean(m.collegeEmail) || loginIsCollege,
      };
    });
  }

  private emailConfigured() {
    return this.env.EMAIL_DELIVERY !== 'log';
  }

  async preview(
    orgId: string,
    audience: AnnouncementAudience,
    departmentId?: string | null,
  ): Promise<AudiencePreview> {
    this.assertScope(departmentId, audience);
    const t = await this.targets(orgId, audience, departmentId);
    return {
      recipients: t.length,
      collegeEmails: t.filter((x) => x.college).length,
      personalEmails: t.filter((x) => !x.college).length,
      missingCollegeEmail: t
        .filter((x) => !x.college)
        .slice(0, 200)
        .map((x) => ({ name: x.name, externalId: x.externalId, email: x.email })),
      emailConfigured: this.emailConfigured(),
    };
  }

  private async audienceLabel(orgId: string, a: AnnouncementAudience) {
    if (a.type === 'all') return 'All students';
    if (a.type === 'departments') {
      const d = await this.prisma.department.findMany({
        where: { id: { in: a.departmentIds }, organizationId: orgId },
        select: { name: true },
        orderBy: { name: 'asc' },
      });
      return d.map((x) => x.name).join(', ') || 'Departments';
    }
    const exam = await this.prisma.quiz.findFirst({
      where: { id: a.examId, organizationId: orgId },
      select: { title: true },
    });
    return `${exam?.title ?? 'Exam'}${a.pendingOnly ? ' · not yet taken' : ''}`;
  }

  /** Posts to the students' portal and emails everyone in Bcc batches. */
  async send(
    actor: User,
    orgId: string,
    input: AnnouncementInput,
    departmentId?: string | null,
  ): Promise<AnnouncementItem> {
    this.assertScope(departmentId, input.audience);
    const [org, targets] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } }),
      this.targets(orgId, input.audience, departmentId),
    ]);
    const a = await this.prisma.announcement.create({
      data: {
        organizationId: orgId,
        subject: input.subject,
        body: input.body,
        linkUrl: input.linkUrl,
        linkLabel: input.linkLabel,
        kind: input.kind,
        examId: input.audience.type === 'exam' ? input.audience.examId : null,
        audience: { ...input.audience, label: await this.audienceLabel(orgId, input.audience) },
        recipients: targets.length,
        collegeEmails: targets.filter((t) => t.college).length,
        personalEmails: targets.filter((t) => !t.college).length,
        sentById: actor.id,
        targets: {
          createMany: { data: targets.map((t) => ({ userId: t.userId, email: t.email })) },
        },
      },
    });

    let emailed = 0;
    let status: AnnouncementItem['emailStatus'] = 'skipped';
    if (input.sendEmail && targets.length) {
      if (!this.emailConfigured()) status = 'not_configured';
      else {
        const link = input.linkUrl?.startsWith('/') ? `${this.web}${input.linkUrl}` : input.linkUrl;
        const msg = announcementEmail({
          orgName: org.name,
          subject: input.subject,
          body: input.body,
          linkUrl: link,
          linkLabel: input.linkLabel,
          senderName: actor.fullName,
          portalUrl: `${this.web}/my-announcements`,
        });
        const emails = [...new Set(targets.map((t) => t.email.toLowerCase()))];
        for (let i = 0; i < emails.length; i += BATCH) {
          const batch = emails.slice(i, i + BATCH);
          const ok = await this.mail.send(
            {
              // Everyone is in Bcc so students don't see each other's addresses.
              to: this.env.MAIL_FROM,
              bcc: batch,
              replyTo: actor.email,
              ...msg,
            },
            'announcement',
          );
          if (ok) emailed += batch.length;
        }
        status = emailed === emails.length ? 'sent' : emailed ? 'partial' : 'failed';
        if (!emailed) this.logger.warn(`Announcement ${a.id}: no email could be sent`);
      }
    }
    const saved = await this.prisma.announcement.update({
      where: { id: a.id },
      data: { emailed, emailStatus: status },
      include: { sentBy: { select: { fullName: true } } },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'announcement.sent',
      entityType: 'announcement',
      entityId: a.id,
      meta: { subject: input.subject, recipients: targets.length, emailed },
    });
    return this.item(saved, 0);
  }

  private item(
    a: Prisma.AnnouncementGetPayload<{ include: { sentBy: { select: { fullName: true } } } }>,
    readCount: number,
  ): AnnouncementItem {
    const aud = a.audience as { label?: string };
    return {
      id: a.id,
      subject: a.subject,
      body: a.body,
      linkUrl: a.linkUrl,
      linkLabel: a.linkLabel,
      kind: a.kind === 'EXAM_REMINDER' ? 'EXAM_REMINDER' : 'GENERAL',
      audienceLabel: aud?.label ?? '',
      recipients: a.recipients,
      emailed: a.emailed,
      collegeEmails: a.collegeEmails,
      personalEmails: a.personalEmails,
      emailStatus: a.emailStatus as AnnouncementItem['emailStatus'],
      readCount,
      sentBy: a.sentBy?.fullName ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }

  async list(
    orgId: string,
    scope?: { departmentId: string; userId: string },
  ): Promise<AnnouncementItem[]> {
    const rows = await this.prisma.announcement.findMany({
      where: {
        organizationId: orgId,
        ...(scope
          ? {
              OR: [
                { sentById: scope.userId },
                { audience: { path: ['departmentIds'], array_contains: [scope.departmentId] } },
              ],
            }
          : {}),
      },
      include: { sentBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const reads = await this.prisma.announcementRecipient.groupBy({
      by: ['announcementId'],
      where: { announcementId: { in: rows.map((r) => r.id) }, readAt: { not: null } },
      _count: { _all: true },
    });
    const byId = new Map(reads.map((r) => [r.announcementId, r._count._all]));
    return rows.map((r) => this.item(r, byId.get(r.id) ?? 0));
  }

  async remove(actor: User, orgId: string, id: string, departmentId?: string | null) {
    const a = await this.prisma.announcement.findFirst({ where: { id, organizationId: orgId } });
    if (!a) throw new NotFoundException();
    if (departmentId && a.sentById !== actor.id)
      throw new ForbiddenException('You can remove only announcements you sent.');
    await this.prisma.announcement.delete({ where: { id } });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'announcement.deleted',
      entityType: 'announcement',
      entityId: id,
      meta: { subject: a.subject },
    });
  }

  // ───────── Students ─────────

  async mine(user: User): Promise<MyAnnouncement[]> {
    const rows = await this.prisma.announcementRecipient.findMany({
      where: {
        userId: user.id,
        announcement: {
          organization: {
            status: 'ACTIVE',
            members: { some: { userId: user.id, status: 'ACTIVE' } },
          },
        },
      },
      include: {
        announcement: {
          include: {
            organization: { select: { name: true } },
            sentBy: { select: { fullName: true } },
          },
        },
      },
      orderBy: { announcement: { createdAt: 'desc' } },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.announcement.id,
      subject: r.announcement.subject,
      body: r.announcement.body,
      linkUrl: r.announcement.linkUrl,
      linkLabel: r.announcement.linkLabel,
      kind: r.announcement.kind === 'EXAM_REMINDER' ? 'EXAM_REMINDER' : 'GENERAL',
      organizationName: r.announcement.organization.name,
      sentBy: r.announcement.sentBy?.fullName ?? null,
      createdAt: r.announcement.createdAt.toISOString(),
      read: Boolean(r.readAt),
    }));
  }

  async unread(user: User) {
    return {
      count: await this.prisma.announcementRecipient.count({
        where: { userId: user.id, readAt: null },
      }),
    };
  }

  async markRead(user: User) {
    await this.prisma.announcementRecipient.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
