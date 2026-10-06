import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, fakeAi, fakeRunner, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('AI-marked coding questions and stopping an exam', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: string;
  let staffTok: string;
  let viewer: string;
  let l1: string;
  let l2: string;
  let questionId: string;
  let examId: string;
  let attempt1: string;

  const staff = () => orgApi(app, staffTok, orgA);
  const me = (t: string) => api(app, t);
  const withSession = (req: ReturnType<ReturnType<typeof api>['post']>, s: string) =>
    req.set('X-Attempt-Session', s);

  const coding = {
    mode: 'ai',
    languages: ['arduino'],
    starter: { arduino: 'void setup() {}\nvoid loop() {}\n' },
    rubric: [
      { text: 'Reads the DHT11 on pin 2', points: 4 },
      { text: 'Turns the fan on pin 8 on above 30 °C', points: 4 },
      { text: 'Prints temperature and humidity', points: 2 },
    ],
    compilePenaltyPct: 50,
    solution: { language: 'arduino', code: 'FULL' },
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgA = (await prisma.organization.create({ data: { name: 'ECE College', slug: 'ece' } })).id;
    staffTok = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['INSTRUCTOR'] }] }))
      .token;
    viewer = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['ORG_VIEWER'] }] })).token;
    l1 = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] })).token;
    l2 = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] })).token;
  });
  afterAll(async () => {
    fakeAi.down = false;
    await app.close();
  });

  it('needs a marking scheme instead of test cases', async () => {
    const none = await staff().post('/questions', {
      type: 'CODING',
      prompt: 'DHT11 fan control',
      points: 10,
      coding: { ...coding, rubric: [] },
    });
    expect(none.status).toBe(422);
    const ok = await staff().post('/questions', {
      type: 'CODING',
      prompt: 'DHT11 fan control',
      points: 10,
      coding,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.coding).toMatchObject({ mode: 'ai', testCases: [] });
    questionId = ok.body.id;

    const tried = await staff().post('/questions/ai-check', {
      prompt: 'DHT11 fan control',
      rubric: coding.rubric,
      language: 'arduino',
      code: 'HALF',
    });
    expect(tried.body).toMatchObject({ awarded: 5, max: 10, compiled: true });
  });

  it('students see the marking scheme, Run only compiles, and marks are partial', async () => {
    examId = (await staff().post('/exams', { title: 'Embedded', durationMinutes: 30 })).body.id;
    await staff().put(`/exams/${examId}/questions`, { questionIds: [questionId] });
    await staff().put(`/exams/${examId}/audience`, { assignToAll: true });
    const now = Date.now();
    await staff().patch(`/exams/${examId}`, {
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    });
    expect((await staff().post(`/exams/${examId}/publish`)).status).toBe(200);

    const s = await me(l1).post(`/my/exams/${examId}/start`);
    attempt1 = s.body.attemptId;
    const q = s.body.questions[0];
    expect(q.coding).toMatchObject({ mode: 'ai', rubric: coding.rubric, samples: [] });
    expect(JSON.stringify(s.body)).not.toContain('FULL'); // the solution never reaches students

    const run = await withSession(
      me(l1).post(`/my/attempts/${attempt1}/run`, {
        questionId,
        language: 'arduino',
        code: 'COMPILE_ERR',
      }),
      s.body.sessionId,
    );
    expect(run.body.results[0]).toMatchObject({ status: 'COMPILE_ERROR', passed: false });

    await withSession(
      me(l1).post(`/my/attempts/${attempt1}/answers`, {
        questionId,
        answer: { language: 'arduino', code: 'HALF but COMPILE_ERR' },
      }),
      s.body.sessionId,
    );
    const done = await withSession(
      me(l1).post(`/my/attempts/${attempt1}/submit`),
      s.body.sessionId,
    );
    // half of 10 marks, then 50 % off for not compiling
    expect(done.body.score).toBe(2.5);
    const detail = await staff().get(`/exams/${examId}/attempts/${attempt1}`);
    expect(detail.body.review[0].ai).toMatchObject({ compiled: false, penaltyPct: 50, max: 10 });
  });

  it('faculty can change the marks; viewers cannot', async () => {
    const calls = fakeAi.calls;
    expect(
      (
        await orgApi(app, viewer, orgA).put(`/exams/${examId}/attempts/${attempt1}/marks`, {
          questionId,
          marks: 8,
        })
      ).status,
    ).toBe(403);
    const r = await staff().put(`/exams/${examId}/attempts/${attempt1}/marks`, {
      questionId,
      marks: 8,
    });
    expect(r.status).toBe(200);
    expect(r.body.review[0]).toMatchObject({ marks: 8, override: 8 });
    expect(Number(r.body.candidate.score)).toBe(8);
    expect(fakeAi.calls).toBe(calls); // re-grading reuses the AI marks
    const cleared = await staff().put(`/exams/${examId}/attempts/${attempt1}/marks`, {
      questionId,
      marks: null,
    });
    expect(cleared.body.review[0].marks).toBe(2.5);
  });

  it('stopping the exam submits everyone still writing; coding is marked afterwards', async () => {
    fakeAi.down = true;
    const s = await me(l2).post(`/my/exams/${examId}/start`);
    await withSession(
      me(l2).post(`/my/attempts/${s.body.attemptId}/answers`, {
        questionId,
        answer: { language: 'arduino', code: 'FULL' },
      }),
      s.body.sessionId,
    );
    expect((await orgApi(app, viewer, orgA).post(`/exams/${examId}/end`)).status).toBe(403);
    const end = await staff().post(`/exams/${examId}/end`);
    expect(end.body).toMatchObject({ submitted: 1, codingPending: 1 });
    expect((await staff().get(`/exams/${examId}`)).body.state).toBe('ENDED');
    expect((await staff().post(`/exams/${examId}/end`)).status).toBe(409);
    const a = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: s.body.attemptId } });
    expect(a).toMatchObject({ status: 'GRADED', submitReason: 'INSTRUCTOR', codingPending: true });

    // the student's page is told the exam is over
    const save = await withSession(
      me(l2).post(`/my/attempts/${s.body.attemptId}/answers`, {
        questionId,
        answer: { language: 'arduino', code: 'x' },
      }),
      s.body.sessionId,
    );
    expect(save.status).toBeGreaterThanOrEqual(400);

    fakeAi.down = false;
    const ev = await staff().post(`/exams/${examId}/evaluate-coding`);
    expect(ev.body).toMatchObject({ evaluated: 1, remaining: 0 });
    const after = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: s.body.attemptId } });
    expect(Number(after.score)).toBe(10);
  });
  it('answers that failed to compile because of the runner can be marked again', async () => {
    fakeAi.down = false;
    const learner = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] }))
      .token;
    const ex = (await staff().post('/exams', { title: 'IoT', durationMinutes: 30 })).body.id;
    await staff().put(`/exams/${ex}/questions`, { questionIds: [questionId] });
    await staff().put(`/exams/${ex}/audience`, { assignToAll: true });
    const now = Date.now();
    await staff().patch(`/exams/${ex}`, {
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    });
    await staff().post(`/exams/${ex}/publish`);

    // the runner lacks WiFi.h during the exam
    fakeRunner.noWifiLib = true;
    const s = await me(learner).post(`/my/exams/${ex}/start`);
    await withSession(
      me(learner).post(`/my/attempts/${s.body.attemptId}/answers`, {
        questionId,
        answer: { language: 'arduino', code: 'HALF #include <WIFI.h>' },
      }),
      s.body.sessionId,
    );
    const done = await withSession(
      me(learner).post(`/my/attempts/${s.body.attemptId}/submit`),
      s.body.sessionId,
    );
    expect(done.body.score).toBe(2.5);

    // runner fixed: mark again
    fakeRunner.noWifiLib = false;
    expect((await orgApi(app, viewer, orgA).post(`/exams/${ex}/remark-coding`, {})).status).toBe(
      403,
    );
    const r = await staff().post(`/exams/${ex}/remark-coding`, {});
    expect(r.body).toEqual({ attempts: 1, answers: 1 });
    const ev = await staff().post(`/exams/${ex}/evaluate-coding`, {});
    expect(ev.body).toEqual({ evaluated: 1, remaining: 0 });
    const d = await staff().get(`/exams/${ex}/attempts/${s.body.attemptId}`);
    expect(Number(d.body.candidate.score)).toBe(5);
    expect(d.body.review[0].ai).toMatchObject({ compiled: true, penaltyPct: 0 });

    // nothing left that didn't compile
    expect((await staff().post(`/exams/${ex}/remark-coding`, {})).body).toEqual({
      attempts: 0,
      answers: 0,
    });
  });
});
