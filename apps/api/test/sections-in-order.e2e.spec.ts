import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

type Q = { id: string; section: string; options: { id: string; text: string }[] };

describe('Sections one at a time', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: string;
  let facultyTok: string;
  let learnerTok: string;
  let learner2Tok: string;
  let examId: string;
  const ids: string[] = [];

  const faculty = () => orgApi(app, facultyTok, orgA);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgA = (await prisma.organization.create({ data: { name: 'Hiring', slug: 'hiring' } })).id;
    facultyTok = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['INSTRUCTOR'] }] }))
      .token;
    learnerTok = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] }))
      .token;
    learner2Tok = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] }))
      .token;
    for (let i = 1; i <= 5; i++)
      ids.push(
        (
          await faculty().post('/questions', {
            type: 'SINGLE_CHOICE',
            prompt: `Question ${i}`,
            points: 1,
            options: [
              { text: 'Right', correct: true },
              { text: 'Wrong', correct: false },
            ],
          })
        ).body.id,
      );
    examId = (
      await faculty().post('/exams', {
        title: 'Round 1',
        durationMinutes: 30,
        requireCamera: false,
        maxViolations: 3,
        sectionsInOrder: true,
      })
    ).body.id;
    expect((await faculty().get(`/exams/${examId}`)).body.sectionsInOrder).toBe(true);
    const plain = await faculty().post('/exams', { title: 'Free sections', durationMinutes: 30 });
    expect(plain.body.sectionsInOrder).toBe(false); // students move freely by default
    await faculty().put(`/exams/${examId}/questions`, {
      questionIds: ids,
      sections: ['1', '1', '2', '2', '3'],
    });
    await faculty().put(`/exams/${examId}/audience`, { assignToAll: true });
    const now = Date.now();
    await faculty().patch(`/exams/${examId}`, {
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3 * 3_600_000).toISOString(),
    });
    const pub = await faculty().post(`/exams/${examId}/publish`);
    expect(pub.body.error ?? null).toBeNull();
  });
  afterAll(async () => {
    await app.close();
  });

  it('a student must finish each section before the next one, and cannot go back', async () => {
    const me = api(app, learnerTok);
    const s = await me.post(`/my/exams/${examId}/start`);
    expect(s.body).toMatchObject({ sectionsInOrder: true, sectionIndex: 0 });
    const qs = s.body.questions as Q[];
    expect(qs.map((q) => q.section)).toEqual(['1', '1', '2', '2', '3']);
    const sid = s.body.sessionId;
    const aid = s.body.attemptId;
    const save = (q: Q) =>
      me
        .post(`/my/attempts/${aid}/answers`, {
          questionId: q.id,
          answer: q.options.find((o) => o.text === 'Right')!.id,
        })
        .set('X-Attempt-Session', sid);
    const next = () => me.post(`/my/attempts/${aid}/next-section`).set('X-Attempt-Session', sid);

    const ahead = await save(qs[2]!);
    expect(ahead.status).toBe(409);
    expect(ahead.body.error.code).toBe('SECTION_LOCKED');

    expect((await save(qs[0]!)).status).toBe(200);
    const early = await next();
    expect(early.body.error).toMatchObject({
      code: 'SECTION_INCOMPLETE',
      details: { unanswered: 1 },
    });

    expect((await save(qs[1]!)).status).toBe(200);
    expect((await next()).body).toEqual({ sectionIndex: 1 });

    const back = await save(qs[0]!);
    expect(back.body.error.code).toBe('SECTION_LOCKED');
    expect((await save(qs[2]!)).status).toBe(200);
    expect((await save(qs[3]!)).status).toBe(200);
    expect((await next()).body).toEqual({ sectionIndex: 2 });
    expect((await next()).body.error.code).toBe('LAST_SECTION');

    // Coming back (e.g. after a reload) resumes at the same section.
    const again = await me.post(`/my/exams/${examId}/start`);
    expect(again.body.error ?? null).toBeNull();
    expect(again.body.sectionIndex).toBe(2);
    await save(qs[4]!).set('X-Attempt-Session', again.body.sessionId);
    const sub = await me
      .post(`/my/attempts/${aid}/submit`)
      .set('X-Attempt-Session', again.body.sessionId);
    expect(sub.body.score).toBe(5);
  });

  it('with the setting off, students move freely between sections', async () => {
    await prisma.quiz.update({ where: { id: examId }, data: { sectionsInOrder: false } });
    const me = api(app, learner2Tok);
    const s = await me.post(`/my/exams/${examId}/start`);
    expect(s.body.sectionsInOrder).toBe(false);
    const q = (s.body.questions as Q[])[4]!;
    const r = await me
      .post(`/my/attempts/${s.body.attemptId}/answers`, {
        questionId: q.id,
        answer: q.options[0]!.id,
      })
      .set('X-Attempt-Session', s.body.sessionId);
    expect(r.status).toBe(200);
  });
});
