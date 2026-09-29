import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, fakeRunner, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Coding questions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: string;
  let instructor: string;
  let l1: string;
  let l2: string;
  let l1Id: string;
  let l2Id: string;
  let questionId: string;
  let examId: string;

  const staff = () => orgApi(app, instructor, orgA);
  const me = (t: string) => api(app, t);

  const coding = {
    languages: ['python'],
    starter: { python: '# reverse the line\n', c: 'ignored because C is not allowed' },
    testCases: [
      { input: 'abc\n', output: 'cba\n', sample: true },
      { input: 'hello\n', output: 'olleh', sample: false },
      { input: 'ab\n', output: 'ba\n', sample: false },
      { input: 'aba\n', output: 'aba\n', sample: false },
    ],
    timeLimitMs: 1000,
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgA = (await prisma.organization.create({ data: { name: 'Code College', slug: 'code' } })).id;
    instructor = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['INSTRUCTOR'] }] }))
      .token;
    const u1 = await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] });
    const u2 = await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] });
    [l1, l1Id, l2, l2Id] = [u1.token, u1.user.id, u2.token, u2.user.id];
  });

  afterAll(async () => {
    fakeRunner.down = false;
    await app.close();
  });

  it('validates and stores coding questions', async () => {
    const noHidden = await staff().post('/questions', {
      type: 'CODING',
      prompt: 'Reverse a string',
      coding: { ...coding, testCases: [{ input: 'a', output: 'a', sample: true }] },
    });
    expect(noHidden.status).toBe(422);
    const noSample = await staff().post('/questions', {
      type: 'CODING',
      prompt: 'Reverse a string',
      coding: { ...coding, testCases: [{ input: 'a', output: 'a', sample: false }] },
    });
    expect(noSample.status).toBe(422);

    const ok = await staff().post('/questions', {
      type: 'CODING',
      prompt: 'Read a line and print it reversed.',
      points: 8,
      negativeMarks: 0,
      coding,
    });
    expect(ok.status).toBe(201);
    questionId = ok.body.id;
    expect(ok.body.negativeMarks).toBe(0);
    expect(ok.body.coding.testCases).toHaveLength(4);
    expect(ok.body.coding.testCases.every((t: { id: string }) => t.id)).toBe(true);
    expect(ok.body.coding.starter).toEqual({ python: '# reverse the line\n' });

    const list = await staff().get('/questions');
    expect(list.body.data.map((q: { id: string }) => q.id)).toContain(questionId);
  });

  it('lets authors check test cases against a reference solution', async () => {
    const r = await staff().post('/questions/check-code', {
      coding,
      language: 'python',
      code: 'REVERSE',
    });
    expect(r.status).toBe(200);
    expect(r.body.results.map((x: { passed: boolean }) => x.passed)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect((await me(l1).get('/code-runner/status')).body.configured).toBe(true);
  });

  it('needs expected outputs, or fills them from the reference solution', async () => {
    const blank = coding.testCases.map((t) => ({ ...t, output: '' }));
    const noKey = await staff().post('/questions', {
      type: 'CODING',
      prompt: 'Reverse (no key)',
      coding: { ...coding, testCases: blank },
    });
    expect(noKey.status).toBe(422);
    const filled = await staff().post('/questions', {
      type: 'CODING',
      prompt: 'Reverse (auto key)',
      coding: { ...coding, testCases: blank, solution: { language: 'python', code: 'REVERSE' } },
    });
    expect(filled.status).toBe(201);
    expect(filled.body.coding.testCases.map((t: { output: string }) => t.output)).toEqual([
      'cba\n',
      'olleh\n',
      'ba\n',
      'aba\n',
    ]);
    expect(filled.body.coding.compare).toBe('flexible');
  });

  it('delivers only sample tests and runs them during the exam', async () => {
    examId = (await staff().post('/exams', { title: 'Coding round', durationMinutes: 30 })).body.id;
    await staff().put(`/exams/${examId}/questions`, { questionIds: [questionId] });
    await staff().put(`/exams/${examId}/audience`, { assignToAll: false, userIds: [l1Id, l2Id] });
    const now = Date.now();
    await staff().patch(`/exams/${examId}`, {
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    });
    expect((await staff().post(`/exams/${examId}/publish`)).status).toBe(200);

    const s = await me(l1).post(`/my/exams/${examId}/start`);
    const q = s.body.questions[0];
    expect(q.coding).toMatchObject({ languages: ['python'], hiddenCount: 3 });
    expect(q.coding.samples).toEqual([{ input: 'abc\n', output: 'cba\n' }]);
    expect(JSON.stringify(s.body)).not.toContain('olleh');

    const run = (body: object) =>
      me(l1)
        .post(`/my/attempts/${s.body.attemptId}/run`, body)
        .set('X-Attempt-Session', s.body.sessionId);
    const samples = await run({ questionId, language: 'python', code: 'REVERSE' });
    expect(samples.status).toBe(200);
    expect(samples.body.results).toEqual([
      expect.objectContaining({ input: 'abc\n', expected: 'cba\n', passed: true, status: 'OK' }),
    ]);
    expect((await run({ questionId, language: 'python', code: 'REVERSE' })).status).toBe(429);
    await new Promise((r) => setTimeout(r, 2100));
    const custom = await run({ questionId, language: 'python', code: 'ECHO', stdin: 'hi' });
    expect(custom.body.results[0]).toMatchObject({ output: 'hi', expected: null, passed: null });
    await new Promise((r) => setTimeout(r, 2100));
    expect((await run({ questionId, language: 'c', code: 'REVERSE' })).status).toBe(422);

    // Answer with a program that only passes the palindrome test: 1 of 4 → 2 of 8 marks.
    const save = await me(l1)
      .post(`/my/attempts/${s.body.attemptId}/answers`, {
        questionId,
        answer: { language: 'python', code: 'ECHO' },
      })
      .set('X-Attempt-Session', s.body.sessionId);
    expect(save.status).toBe(200);
    const bad = await me(l1)
      .post(`/my/attempts/${s.body.attemptId}/answers`, {
        questionId,
        answer: { language: 'c', code: 'x' },
      })
      .set('X-Attempt-Session', s.body.sessionId);
    expect(bad.status).toBe(422);

    await me(l1)
      .post(`/my/attempts/${s.body.attemptId}/submit`)
      .set('X-Attempt-Session', s.body.sessionId);
    const r = await me(l1).get(`/my/attempts/${s.body.attemptId}/result`);
    expect(r.body).toMatchObject({ score: 2, maxScore: 8, codingPending: false });
  });

  it('keeps coding answers pending when the runner is down, then re-evaluates', async () => {
    const s = await me(l2).post(`/my/exams/${examId}/start`);
    await me(l2)
      .post(`/my/attempts/${s.body.attemptId}/answers`, {
        questionId,
        answer: { language: 'python', code: 'REVERSE' },
      })
      .set('X-Attempt-Session', s.body.sessionId);
    fakeRunner.down = true;
    await me(l2)
      .post(`/my/attempts/${s.body.attemptId}/submit`)
      .set('X-Attempt-Session', s.body.sessionId);
    const pending = await me(l2).get(`/my/attempts/${s.body.attemptId}/result`);
    expect(pending.body).toMatchObject({ score: 0, codingPending: true });
    const stats = await staff().get(`/exams/${examId}/analytics`);
    expect(stats.body.stats.codingPending).toBe(1);

    fakeRunner.down = false;
    const ev = await staff().post(`/exams/${examId}/evaluate-coding`);
    expect(ev.body).toEqual({ evaluated: 1, remaining: 0 });
    const done = await me(l2).get(`/my/attempts/${s.body.attemptId}/result`);
    expect(done.body).toMatchObject({ score: 8, percentage: 100, codingPending: false });

    const detail = await staff().get(`/exams/${examId}/attempts/${s.body.attemptId}`);
    expect(detail.body.review[0]).toMatchObject({ testsPassed: 4, testsTotal: 4, marks: 8 });
  });
});
