import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Examinations', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: string;
  let admin: string,
    instructor: string,
    l1: string,
    l2: string,
    l3: string,
    l4: string,
    outsider: string,
    l4Id: string;
  let ece: string;
  let eceStaff: string;
  const qIds: Record<string, string> = {};
  let examId: string;

  const staff = (token = instructor) => orgApi(app, token, orgA);
  const me = (token: string) => api(app, token);
  const withSession = (req: ReturnType<ReturnType<typeof api>['post']>, s: string) =>
    req.set('X-Attempt-Session', s);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgA = (await prisma.organization.create({ data: { name: 'Alpha College', slug: 'alpha' } }))
      .id;
    const orgB = (await prisma.organization.create({ data: { name: 'Beta', slug: 'beta' } })).id;
    ece = (await prisma.department.create({ data: { organizationId: orgA, name: 'ECE' } })).id;
    const cse = (await prisma.department.create({ data: { organizationId: orgA, name: 'CSE' } }))
      .id;
    admin = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['ORG_ADMIN'] }] })).token;
    instructor = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['INSTRUCTOR'] }] }))
      .token;
    const mk = async (dept: string) => {
      const u = await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] });
      await prisma.organizationMember.updateMany({
        where: { userId: u.user.id },
        data: { departmentId: dept },
      });
      return u;
    };
    l1 = (await mk(ece)).token;
    l2 = (await mk(ece)).token;
    l3 = (await mk(cse)).token;
    const u4 = await mk(cse);
    l4 = u4.token;
    l4Id = u4.user.id;
    outsider = (await makeUser(prisma, { memberOf: [{ orgId: orgB, roles: ['LEARNER'] }] })).token;
    // An instructor in the ECE department must NOT become a candidate of a department-assigned exam.
    const eceInstructor = await makeUser(prisma, {
      memberOf: [{ orgId: orgA, roles: ['INSTRUCTOR'] }],
    });
    await prisma.organizationMember.updateMany({
      where: { userId: eceInstructor.user.id },
      data: { departmentId: ece },
    });
    eceStaff = eceInstructor.token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('question bank', () => {
    it('validates and stores all auto-graded types', async () => {
      const bad = await staff().post('/questions', {
        type: 'SINGLE_CHOICE',
        prompt: 'Pick one',
        options: [
          { text: 'A', correct: true },
          { text: 'B', correct: true },
        ],
      });
      expect(bad.status).toBe(422);

      const sc = await staff().post('/questions', {
        type: 'SINGLE_CHOICE',
        prompt: 'Which pin type reads a button?',
        topic: 'GPIO',
        difficulty: 'EASY',
        points: 2,
        negativeMarks: 0.5,
        options: [
          { text: 'Digital input', correct: true },
          { text: 'PWM output' },
          { text: 'I2C SDA' },
          { text: 'Ground' },
        ],
      });
      expect(sc.status).toBe(201);
      expect(sc.body.correctAnswer).toHaveLength(1);
      qIds.sc = sc.body.id;

      qIds.mc = (
        await staff().post('/questions', {
          type: 'MULTIPLE_CHOICE',
          prompt: 'Which are serial protocols?',
          topic: 'Protocols',
          points: 2,
          options: [
            { text: 'UART', correct: true },
            { text: 'I2C', correct: true },
            { text: 'PWM' },
          ],
        })
      ).body.id;
      qIds.tf = (
        await staff().post('/questions', {
          type: 'TRUE_FALSE',
          prompt: 'ESP32 has built-in Wi-Fi.',
          answer: true,
          topic: 'ESP32',
        })
      ).body.id;
      qIds.num = (
        await staff().post('/questions', {
          type: 'NUMERIC',
          prompt: 'Resistor for 5V, 20mA LED (Vf 2V)? (ohms)',
          value: 150,
          tolerance: 1,
          topic: 'Electronics',
          points: 3,
        })
      ).body.id;
      expect(Object.values(qIds).every(Boolean)).toBe(true);
    });

    it('is staff-only and org-scoped', async () => {
      expect((await orgApi(app, l1, orgA).get('/questions')).status).toBe(403);
      expect((await orgApi(app, outsider, orgA).get('/questions')).status).toBe(403);
      const list = await staff().get('/questions?topic=gpio');
      expect(list.body.meta.total).toBe(1);
    });
  });

  describe('exam builder', () => {
    it('refuses to publish until ready, then publishes', async () => {
      const created = await staff().post('/exams', { title: 'IoT Mid-term', durationMinutes: 30 });
      expect(created.status).toBe(201);
      examId = created.body.id;
      expect(created.body.publishIssues.length).toBeGreaterThan(0);
      expect((await staff().post(`/exams/${examId}/publish`)).body.error.code).toBe('NOT_READY');

      await staff().put(`/exams/${examId}/questions`, {
        questionIds: [qIds.sc, qIds.mc, qIds.tf, qIds.num],
      });
      await staff().put(`/exams/${examId}/audience`, {
        assignToAll: false,
        departmentIds: [ece],
        userIds: [l4Id],
      });
      const now = Date.now();
      await staff().patch(`/exams/${examId}`, {
        startsAt: new Date(now - 60_000).toISOString(),
        endsAt: new Date(now + 3_600_000).toISOString(),
        negativeMarking: true,
        maxViolations: 3,
      });
      const ready = await staff().get(`/exams/${examId}`);
      expect(ready.body.publishIssues).toEqual([]);
      expect(ready.body.assignedCount).toBe(3);
      expect(ready.body.totalMarks).toBe(8);

      const pub = await staff().post(`/exams/${examId}/publish`);
      expect(pub.status).toBe(200);
      expect(pub.body.state).toBe('LIVE');
    });

    it('locks questions and settings once published', async () => {
      expect(
        (await staff().put(`/exams/${examId}/questions`, { questionIds: [qIds.sc] })).body.error
          .code,
      ).toBe('EXAM_LOCKED');
      expect(
        (await staff().patch(`/exams/${examId}`, { durationMinutes: 90 })).body.error.code,
      ).toBe('EXAM_LOCKED');
      expect(
        (
          await staff().put(`/questions/${qIds.sc}`, {
            type: 'TRUE_FALSE',
            prompt: 'Changed?',
            answer: false,
          })
        ).body.error.code,
      ).toBe('QUESTION_LOCKED');
      expect((await staff().patch(`/exams/${examId}`, { title: 'IoT Mid-term 2026' })).status).toBe(
        200,
      );
    });
  });

  describe('taking the exam', () => {
    let session1: string;
    let attempt1: string;

    it('shows the exam only to assigned learners', async () => {
      const mine = await me(l1).get('/my/exams');
      expect(mine.body.map((e: { id: string }) => e.id)).toContain(examId);
      expect(mine.body[0].state).toBe('LIVE');
      expect((await me(l3).get(`/my/exams/${examId}`)).status).toBe(404);
      expect((await me(outsider).get(`/my/exams/${examId}`)).status).toBe(404);
      expect((await me(l3).post(`/my/exams/${examId}/start`)).status).toBe(404);
      expect((await me(eceStaff).get(`/my/exams/${examId}`)).status).toBe(404);
    });

    it('delivers questions without the answer key', async () => {
      const s = await me(l1).post(`/my/exams/${examId}/start`);
      expect(s.status).toBe(200);
      session1 = s.body.sessionId;
      attempt1 = s.body.attemptId;
      expect(s.body.questions).toHaveLength(4);
      expect(JSON.stringify(s.body)).not.toContain('correctAnswer');
      expect(JSON.stringify(s.body)).not.toContain('explanation');
      expect(new Date(s.body.deadlineAt).getTime() - Date.now()).toBeLessThanOrEqual(
        30 * 60_000 + 1000,
      );
    });

    it('saves answers only from the active session and validates them', async () => {
      const q = await me(l1).post(`/my/exams/${examId}/start`); // resume from the "same" device quickly -> takeover
      expect(q.body.resumed).toBe(true);
      expect(q.body.violationCount).toBe(1); // SESSION_TAKEOVER counted
      const oldSave = await withSession(
        me(l1).post(`/my/attempts/${attempt1}/answers`, { questionId: qIds.tf, answer: 'true' }),
        session1,
      );
      expect(oldSave.body.error.code).toBe('SESSION_REPLACED');
      session1 = q.body.sessionId;
      const invalid = await withSession(
        me(l1).post(`/my/attempts/${attempt1}/answers`, { questionId: qIds.tf, answer: 'maybe' }),
        session1,
      );
      expect(invalid.status).toBe(422);
      const ok = await withSession(
        me(l1).post(`/my/attempts/${attempt1}/answers`, { questionId: qIds.tf, answer: 'true' }),
        session1,
      );
      expect(ok.status).toBe(200);
      const otherUser = await withSession(
        me(l2).post(`/my/attempts/${attempt1}/answers`, { questionId: qIds.tf, answer: 'true' }),
        session1,
      );
      expect(otherUser.status).toBe(404);
    });

    it('counts violations (debounced) and auto-submits at the limit', async () => {
      const ev = (type: string) =>
        withSession(me(l1).post(`/my/attempts/${attempt1}/events`, { type }), session1);
      const agePrevious = () =>
        prisma.proctorEvent.updateMany({
          where: { attemptId: attempt1 },
          data: { occurredAt: new Date(Date.now() - 10_000) },
        });
      await agePrevious();
      const first = await ev('TAB_HIDDEN');
      expect(first.body).toMatchObject({ violationCount: 2, remaining: 1, autoSubmitted: false });
      const blurRightAfter = await ev('WINDOW_BLUR');
      expect(blurRightAfter.body.violationCount).toBe(2); // debounced
      const copy = await ev('COPY');
      expect(copy.body.violationCount).toBe(2); // logged, not counted
      await agePrevious();
      const last = await ev('FULLSCREEN_EXIT');
      expect(last.body).toMatchObject({ violationCount: 3, autoSubmitted: true });
      const after = await withSession(
        me(l1).post(`/my/attempts/${attempt1}/answers`, { questionId: qIds.sc, answer: null }),
        session1,
      );
      expect(after.body.error.code).toBe('ATTEMPT_CLOSED');
      const r = await me(l1).get(`/my/attempts/${attempt1}/result`);
      expect(r.body.submitReason).toBe('VIOLATIONS');
      expect(r.body.score).toBe(1); // true/false correct (1 mark), others unanswered
    });

    it('grades instantly, ranks, and hides answers until the window closes', async () => {
      const s = await me(l2).post(`/my/exams/${examId}/start`);
      const sid = s.body.sessionId;
      const aid = s.body.attemptId;
      const byType = Object.fromEntries(
        s.body.questions.map(
          (q: { id: string; type: string; options: { id: string; text: string }[] }) => [q.type, q],
        ),
      );
      const opt = (type: string, text: string) =>
        byType[type].options.find((o: { text: string }) => o.text === text).id;
      const save = (questionId: string, answer: unknown) =>
        withSession(me(l2).post(`/my/attempts/${aid}/answers`, { questionId, answer }), sid);
      await save(qIds.sc, opt('SINGLE_CHOICE', 'Digital input'));
      await save(qIds.mc, [opt('MULTIPLE_CHOICE', 'UART'), opt('MULTIPLE_CHOICE', 'I2C')]);
      await save(qIds.tf, 'true');
      await save(qIds.num, 150.5);
      const res = await withSession(me(l2).post(`/my/attempts/${aid}/submit`), sid);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        score: 8,
        maxScore: 8,
        percentage: 100,
        passed: true,
        correctCount: 4,
        rank: 1,
        candidates: 2,
      });
      expect(res.body.review).toBeNull();
      expect(res.body.releaseNote).toContain('unlock');
      expect(res.body.byTopic.length).toBe(4);

      expect((await me(l2).post(`/my/exams/${examId}/start`)).body.error.code).toBe(
        'NO_ATTEMPTS_LEFT',
      );
    });

    it('enforces the deadline on the server', async () => {
      const s = await me(l4).post(`/my/exams/${examId}/start`);
      await prisma.quizAttempt.update({
        where: { id: s.body.attemptId },
        data: { deadlineAt: new Date(Date.now() - 60_000) },
      });
      const late = await withSession(
        me(l4).post(`/my/attempts/${s.body.attemptId}/answers`, {
          questionId: qIds.tf,
          answer: 'true',
        }),
        s.body.sessionId,
      );
      expect(late.body.error.code).toBe('TIME_UP');
      const r = await me(l4).get(`/my/attempts/${s.body.attemptId}/result`);
      expect(r.body.submitReason).toBe('TIME_UP');
      expect(r.body.score).toBe(0);
    });
  });

  describe('results & analytics', () => {
    it('gives staff full analytics including absentees and CSV', async () => {
      const a = await staff().get(`/exams/${examId}/analytics`);
      expect(a.status).toBe(200);
      expect(a.body.stats).toMatchObject({
        assigned: 3,
        submitted: 3,
        notStarted: 0,
        highestPct: 100,
        autoSubmitted: 2,
      });
      expect(a.body.candidates[0].percentage).toBe(100);
      expect(a.body.questions).toHaveLength(4);
      expect(a.body.violationsByType.SESSION_TAKEOVER).toBe(1);
      expect(a.body.distribution).toHaveLength(10);
      const csv = await staff().get(`/exams/${examId}/results.csv`);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Rank,Name,Email');
      expect((await orgApi(app, l1, orgA).get(`/exams/${examId}/analytics`)).status).toBe(403);

      const detail = await staff().get(
        `/exams/${examId}/attempts/${a.body.candidates.find((c: { violationCount: number }) => c.violationCount === 3).attemptId}`,
      );
      expect(detail.body.events.filter((e: { counted: boolean }) => e.counted)).toHaveLength(3);
    });

    it('unlocks answer review after the window closes; supports manual release', async () => {
      const mine = (await me(l2).get('/my/exams')).body.find(
        (e: { id: string }) => e.id === examId,
      );
      await prisma.quiz.update({
        where: { id: examId },
        data: { endsAt: new Date(Date.now() - 1000) },
      });
      const r = await me(l2).get(`/my/attempts/${mine.lastAttempt.id}/result`);
      expect(r.body.review).toHaveLength(4);
      expect(r.body.review[0].correctAnswer).toBeDefined();

      await staff().patch(`/exams/${examId}`, { resultVisibility: 'MANUAL_RELEASE' });
      const hidden = await me(l2).get(`/my/attempts/${mine.lastAttempt.id}/result`);
      expect(hidden.body).toMatchObject({ scoreVisible: false, score: null, review: null });
      await orgApi(app, admin, orgA).post(`/exams/${examId}/release-results`);
      const shown = await me(l2).get(`/my/attempts/${mine.lastAttempt.id}/result`);
      expect(shown.body.score).toBe(8);
    });

    it('cannot unpublish once candidates have started', async () => {
      expect((await staff().post(`/exams/${examId}/unpublish`)).body.error.code).toBe(
        'HAS_ATTEMPTS',
      );
    });
  });
  describe('strict exams (leaving submits) with camera', () => {
    let strictId: string;

    it('defaults new exams to strict mode with the camera on', async () => {
      const created = await staff().post('/exams', { title: 'Strict quiz', durationMinutes: 20 });
      strictId = created.body.id;
      expect(created.body).toMatchObject({ maxViolations: 1, requireCamera: true });
      await staff().put(`/exams/${strictId}/questions`, { questionIds: [qIds.sc, qIds.tf] });
      await staff().put(`/exams/${strictId}/audience`, {
        assignToAll: false,
        departmentIds: [ece],
        userIds: [l4Id],
      });
      const now = Date.now();
      await staff().patch(`/exams/${strictId}`, {
        startsAt: new Date(now - 60_000).toISOString(),
        endsAt: new Date(now + 3_600_000).toISOString(),
      });
      expect((await staff().post(`/exams/${strictId}/publish`)).status).toBe(200);
      const lobby = await me(l1).get(`/my/exams/${strictId}`);
      expect(lobby.body).toMatchObject({ maxViolations: 1, requireCamera: true });
    });

    it('submits on the first time the student leaves', async () => {
      const s = await me(l1).post(`/my/exams/${strictId}/start`);
      expect(s.body).toMatchObject({ maxViolations: 1, requireCamera: true });
      const ev = (type: string) =>
        withSession(
          me(l1).post(`/my/attempts/${s.body.attemptId}/events`, { type }),
          s.body.sessionId,
        );
      const shortcut = await ev('SHORTCUT');
      expect(shortcut.body).toMatchObject({ violationCount: 0, autoSubmitted: false });
      const cam = await ev('CAMERA_OFF');
      expect(cam.body).toMatchObject({ violationCount: 0, autoSubmitted: false });
      const left = await ev('FULLSCREEN_EXIT');
      expect(left.body).toMatchObject({ violationCount: 1, autoSubmitted: true });
      const r = await me(l1).get(`/my/attempts/${s.body.attemptId}/result`);
      expect(r.body.submitReason).toBe('VIOLATIONS');
    });

    it('treats signs of AI help (extension on the page, second screen) as leaving', async () => {
      const s = await me(l2).post(`/my/exams/${strictId}/start`);
      const ai = await withSession(
        me(l2).post(`/my/attempts/${s.body.attemptId}/events`, {
          type: 'AI_EXTENSION',
          meta: { what: 'div#sider-root' },
        }),
        s.body.sessionId,
      );
      expect(ai.body).toMatchObject({ violationCount: 1, autoSubmitted: true });
      const ev = await prisma.proctorEvent.findFirst({
        where: { attemptId: s.body.attemptId, type: 'AI_EXTENSION' },
      });
      expect(ev).toMatchObject({ counted: true, meta: { what: 'div#sider-root' } });
    });

    it('gives read-only viewers results and people, but no way to change anything', async () => {
      const viewer = (
        await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['ORG_VIEWER'] }] })
      ).token;
      const v = orgApi(app, viewer, orgA);
      // Can see
      expect((await v.get('/exams')).status).toBe(200);
      expect((await v.get(`/exams/${examId}/analytics`)).status).toBe(200);
      expect((await v.get(`/exams/${examId}/results.csv`)).status).toBe(200);
      expect((await v.get('/members')).status).toBe(200);
      expect((await v.get('/members/summary')).status).toBe(200);
      expect((await v.get('/departments')).status).toBe(200);
      // Live exam: no question texts or answer keys for viewers (staff still get them)
      const live = await v.get(`/exams/${strictId}/analytics`);
      expect(live.body).toMatchObject({ questions: [], questionsHidden: true });
      expect((await staff().get(`/exams/${strictId}/analytics`)).body.questions.length).toBe(2);
      // Can't change or author anything
      expect((await v.get(`/exams/${examId}`)).status).toBe(403);
      expect((await v.post('/exams', { title: 'Nope nope', durationMinutes: 10 })).status).toBe(
        403,
      );
      expect((await v.patch(`/exams/${strictId}`, { title: 'Changed title' })).status).toBe(403);
      expect((await v.post(`/exams/${strictId}/unpublish`)).status).toBe(403);
      expect((await v.get('/questions')).status).toBe(403);
      expect(
        (await v.post('/members', { email: 'x@y.z', fullName: 'X Y', roles: ['LEARNER'] })).status,
      ).toBe(403);
      expect((await v.post('/departments', { name: 'MECH' })).status).toBe(403);
      expect((await v.get('/join-settings')).status).toBe(403);
    });

    it('submits when the student comes back after closing the page', async () => {
      const s = await me(l4).post(`/my/exams/${strictId}/start`);
      // Page closed without the "left" event arriving; the attempt looks idle.
      await prisma.quizAttempt.update({
        where: { id: s.body.attemptId },
        data: { lastSeenAt: new Date(Date.now() - 60_000) },
      });
      const again = await me(l4).post(`/my/exams/${strictId}/start`);
      expect(again.body.error.code).toBe('AUTO_SUBMITTED');
      expect(again.body.error.details.attemptId).toBe(s.body.attemptId);
      const r = await me(l4).get(`/my/attempts/${s.body.attemptId}/result`);
      expect(r.body.submitReason).toBe('VIOLATIONS');
    });
  });
});
