import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Re-exam: faculty give a student a fresh attempt', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let staff: string;
  let viewer: string;
  let student: { id: string; token: string };
  let examId: string;

  const start = () => api(app, student.token).post(`/my/exams/${examId}/start`);
  const submit = (attemptId: string, sid: string) =>
    api(app, student.token).post(`/my/attempts/${attemptId}/submit`).set('X-Attempt-Session', sid);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgId = (await prisma.organization.create({ data: { name: 'Re College', slug: 're' } })).id;
    staff = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['INSTRUCTOR'] }] })).token;
    viewer = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_VIEWER'] }] })).token;
    const s = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
    student = { id: s.user.id, token: s.token };
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
          title: 'Strict exam',
          status: 'PUBLISHED',
          assignToAll: true,
          timeLimitMinutes: 10,
          maxAttempts: 1,
          maxViolations: 1,
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 3_600_000),
          questions: { create: [{ questionId: q.id, position: 0 }] },
        },
      })
    ).id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('keeps the old attempt as a record and lets the student write again', async () => {
    // a genuine mistake: leaving full screen on a strict exam submits it
    const s1 = await start();
    const ev = await api(app, student.token)
      .post(`/my/attempts/${s1.body.attemptId}/events`, { type: 'FULLSCREEN_EXIT' })
      .set('X-Attempt-Session', s1.body.sessionId);
    expect(ev.body.autoSubmitted).toBe(true);
    expect((await start()).body.error.code).toBe('NO_ATTEMPTS_LEFT');

    // viewers can't grant; a reason is required
    const path = `/exams/${examId}/attempts/${s1.body.attemptId}/reexam`;
    expect((await orgApi(app, viewer, orgId).post(path, { reason: 'Mistake' })).status).toBe(403);
    expect((await orgApi(app, staff, orgId).post(path, { reason: '' })).status).toBe(422);

    const g = await orgApi(app, staff, orgId).post(path, { reason: 'Left full screen by mistake' });
    expect(g.status).toBe(200);
    expect(g.body.voided).toMatchObject({ reason: 'Left full screen by mistake', until: null });
    expect((await orgApi(app, staff, orgId).post(path, { reason: 'Again' })).status).toBe(409);

    // results: the old attempt no longer counts; the student shows as "re-exam given"
    const before = await orgApi(app, staff, orgId).get(`/exams/${examId}/analytics`);
    const row = before.body.candidates.find((c: { userId: string }) => c.userId === student.id);
    expect(row).toMatchObject({ status: 'NOT_STARTED', reexam: { used: false } });

    // the student can start a fresh attempt and finish it
    const mine = await api(app, student.token).get('/my/exams');
    expect(mine.body.find((e: { id: string }) => e.id === examId)).toMatchObject({
      canStart: true,
      attemptsUsed: 0,
    });
    const s2 = await start();
    expect(s2.status).toBe(200);
    expect(s2.body.attemptId).not.toBe(s1.body.attemptId);
    expect((await submit(s2.body.attemptId, s2.body.sessionId)).status).toBe(200);

    const after = await orgApi(app, staff, orgId).get(`/exams/${examId}/analytics`);
    const row2 = after.body.candidates.find((c: { userId: string }) => c.userId === student.id);
    expect(row2).toMatchObject({ attemptId: s2.body.attemptId, reexam: { used: true } });
    // the old attempt is still there, with its log
    const old = await orgApi(app, staff, orgId).get(
      `/exams/${examId}/attempts/${s1.body.attemptId}`,
    );
    expect(old.body.voided).not.toBeNull();
    expect(old.body.events.some((e: { type: string }) => e.type === 'FULLSCREEN_EXIT')).toBe(true);
    expect(old.body.attempts.map((a: { voided: boolean }) => a.voided)).toEqual([false, true]);
    expect((await start()).body.error.code).toBe('NO_ATTEMPTS_LEFT');
  });

  it('after the exam has closed, the re-exam stays open for that student only', async () => {
    const attempt = await prisma.quizAttempt.findFirstOrThrow({
      where: { quizId: examId, userId: student.id, voidedAt: null },
    });
    await prisma.quiz.update({
      where: { id: examId },
      data: { endsAt: new Date(Date.now() - 60_000) },
    });
    const until = new Date(Date.now() + 2 * 3_600_000);
    const g = await orgApi(app, staff, orgId).post(
      `/exams/${examId}/attempts/${attempt.id}/reexam`,
      { reason: 'Power cut in the lab', until: until.toISOString() },
    );
    expect(g.body.voided.until).toBe(until.toISOString());

    const item = (await api(app, student.token).get('/my/exams')).body.find(
      (e: { id: string }) => e.id === examId,
    );
    expect(item).toMatchObject({ state: 'LIVE', canStart: true, endsAt: until.toISOString() });
    const s3 = await start();
    expect(s3.status).toBe(200);
    expect(new Date(s3.body.deadlineAt).getTime()).toBeLessThanOrEqual(until.getTime());
  });
});
