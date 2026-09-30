import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, fakeFirebaseUsers, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import type { EmailJob } from '@arc/types';

describe('Announcements and exam reminders (college email first)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let ece: string;
  let cse: string;
  let staff: string;
  let admin: string;
  let viewer: string;
  const sent: EmailJob[] = [];
  const st: { id: string; token: string }[] = [];
  let examId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    // Capture emails instead of sending them.
    const mail = app.get(MailService);
    mail.send = async (job: EmailJob) => {
      sent.push(job);
      return true;
    };
    orgId = (
      await prisma.organization.create({
        data: { name: 'Mail College', slug: 'mail', joinCode: 'MAIL-TEST', joinEnabled: true },
      })
    ).id;
    ece = (await prisma.department.create({ data: { organizationId: orgId, name: 'ECE' } })).id;
    cse = (await prisma.department.create({ data: { organizationId: orgId, name: 'CSE' } })).id;
    staff = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['INSTRUCTOR'] }] })).token;
    admin = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_ADMIN'] }] })).token;
    viewer = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_VIEWER'] }] })).token;
    // 3 ECE (two with college email), 1 CSE
    for (let i = 0; i < 4; i++) {
      const s = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
      await prisma.organizationMember.updateMany({
        where: { userId: s.user.id },
        data: {
          departmentId: i < 3 ? ece : cse,
          collegeEmail: i < 2 ? `s${i}@mail.edu.in` : null,
        },
      });
      st.push({ id: s.user.id, token: s.token });
    }
    const q = await prisma.question.create({
      data: {
        organizationId: orgId,
        type: 'TRUE_FALSE',
        prompt: 'Q?',
        options: [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' },
        ],
        correctAnswer: ['true'],
      },
    });
    examId = (
      await prisma.quiz.create({
        data: {
          organizationId: orgId,
          title: 'DHT11 test',
          status: 'PUBLISHED',
          assignToAll: false,
          audiences: { create: [{ departmentId: ece }] },
          timeLimitMinutes: 10,
          startsAt: new Date(Date.now() + 86_400_000),
          endsAt: new Date(Date.now() + 90_000_000),
          questions: { create: [{ questionId: q.id, position: 0 }] },
        },
      })
    ).id;
    // student 0 already submitted
    await prisma.quizAttempt.create({
      data: {
        organizationId: orgId,
        quizId: examId,
        userId: st[0]!.id,
        status: 'SUBMITTED',
        attemptNo: 1,
        submittedAt: new Date(),
      },
    });
  });
  afterAll(async () => {
    await app.close();
  });

  it('previews who will get it and which emails are college emails', async () => {
    const all = await orgApi(app, staff, orgId).post('/announcements/preview', {
      audience: { type: 'all' },
    });
    expect(all.body).toMatchObject({ recipients: 4, collegeEmails: 2, personalEmails: 2 });
    const exam = await orgApi(app, staff, orgId).post('/announcements/preview', {
      audience: { type: 'exam', examId, pendingOnly: true },
    });
    expect(exam.body.recipients).toBe(2); // ECE minus the one who submitted
  });

  it('sends an exam reminder in one go (Bcc, college email first) and posts it to the portal', async () => {
    sent.length = 0;
    const r = await orgApi(app, staff, orgId).post('/announcements', {
      subject: 'Reminder: DHT11 test tomorrow',
      body: 'Your exam opens tomorrow at 10:00.\nUse Chrome and keep your camera on.',
      linkUrl: `/exam/${examId}`,
      linkLabel: 'Open the exam',
      kind: 'EXAM_REMINDER',
      audience: { type: 'exam', examId, pendingOnly: true },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      recipients: 2,
      emailed: 2,
      collegeEmails: 1,
      personalEmails: 1,
      emailStatus: 'sent',
      audienceLabel: 'DHT11 test · not yet taken',
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.bcc).toEqual(expect.arrayContaining(['s1@mail.edu.in']));
    expect(sent[0]!.bcc).toHaveLength(2);
    expect(sent[0]!.html).toContain(`/exam/${examId}`);
    expect(sent[0]!.subject).toBe('Reminder: DHT11 test tomorrow');

    const mine = await api(app, st[1]!.token).get('/my/announcements');
    expect(mine.body[0]).toMatchObject({ subject: 'Reminder: DHT11 test tomorrow', read: false });
    expect((await api(app, st[1]!.token).get('/my/announcements/unread')).body.count).toBe(1);
    await api(app, st[1]!.token).post('/my/announcements/read');
    expect((await api(app, st[1]!.token).get('/my/announcements/unread')).body.count).toBe(0);
    // the one who already submitted and the CSE student didn't get it
    expect((await api(app, st[0]!.token).get('/my/announcements')).body).toEqual([]);
    expect((await api(app, st[3]!.token).get('/my/announcements')).body).toEqual([]);
    const list = await orgApi(app, staff, orgId).get('/announcements');
    expect(list.body[0]).toMatchObject({ readCount: 1 });
  });

  it('sends a general message to chosen departments', async () => {
    sent.length = 0;
    const r = await orgApi(app, staff, orgId).post('/announcements', {
      subject: 'Lab closed on Friday',
      body: 'The IoT lab is closed this Friday.',
      audience: { type: 'departments', departmentIds: [cse] },
    });
    expect(r.body).toMatchObject({ recipients: 1, emailed: 1, audienceLabel: 'CSE' });
    const bad = await orgApi(app, staff, orgId).post('/announcements', {
      subject: 'x',
      body: 'y',
      audience: { type: 'departments', departmentIds: [] },
    });
    expect(bad.status).toBe(422);
  });

  it('only staff can send; viewers and students cannot', async () => {
    expect(
      (
        await orgApi(app, viewer, orgId).post('/announcements/preview', {
          audience: { type: 'all' },
        })
      ).status,
    ).toBe(403);
    expect((await orgApi(app, st[1]!.token, orgId).get('/announcements')).status).toBe(403);
  });

  it('registration requires a college email on the college domain', async () => {
    await orgApi(app, admin, orgId).put('/join-settings', {
      collegeEmailDomains: ['@Mail.edu.in'],
    });
    const info = await api(app).get('/join/MAIL-TEST');
    expect(info.body.collegeEmailDomains).toEqual(['mail.edu.in']);
    const uid = 'uid-newmail';
    fakeFirebaseUsers.set('kiran@gmail.com', { uid, email: 'kiran@gmail.com' });
    const body = { fullName: 'Kiran Kumar', externalId: '22ECE99', departmentId: ece };
    const personal = await api(app, uid).post('/join/MAIL-TEST', {
      ...body,
      collegeEmail: 'kiran@gmail.com',
    });
    expect(personal.status).toBe(400);
    expect(personal.body.error.message).toContain('@mail.edu.in');
    const ok = await api(app, uid).post('/join/MAIL-TEST', {
      ...body,
      collegeEmail: 'Kiran@MAIL.edu.in',
    });
    expect(ok.status).toBe(200);
    const me = await api(app, uid).get('/auth/me');
    expect(me.body.memberships[0]).toMatchObject({
      collegeEmail: 'kiran@mail.edu.in',
      collegeEmailDomains: ['mail.edu.in'],
    });
    // students without one can add it later
    const add = await api(app, st[2]!.token).put('/my/college-email', {
      organizationId: orgId,
      collegeEmail: 's2@mail.edu.in',
    });
    expect(add.status).toBe(200);
    const pre = await orgApi(app, staff, orgId).post('/announcements/preview', {
      audience: { type: 'departments', departmentIds: [ece] },
    });
    expect(pre.body).toMatchObject({ recipients: 4, collegeEmails: 4, personalEmails: 0 });
  });
});
