import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Pass mark after the exam, and the next round for those who passed', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: string;
  let facultyTok: string;
  let viewerTok: string;
  const students: { id: string; token: string }[] = [];
  let round1: string;
  let round2: string;
  const qs: string[] = [];

  const faculty = () => orgApi(app, facultyTok, orgA);

  async function exam(title: string) {
    const id = (
      await faculty().post('/exams', { title, durationMinutes: 30, requireCamera: false })
    ).body.id as string;
    await faculty().put(`/exams/${id}/questions`, { questionIds: qs });
    const now = Date.now();
    await faculty().patch(`/exams/${id}`, {
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3 * 3_600_000).toISOString(),
    });
    return id;
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgA = (await prisma.organization.create({ data: { name: 'Hiring', slug: 'hiring' } })).id;
    facultyTok = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['INSTRUCTOR'] }] }))
      .token;
    viewerTok = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['ORG_VIEWER'] }] }))
      .token;
    for (let i = 0; i < 3; i++) {
      const s = await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] });
      students.push({ id: s.user.id, token: s.token });
    }
    for (let i = 1; i <= 4; i++)
      qs.push(
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
    round1 = await exam('Round 1');
    round2 = await exam('Round 2');
    await faculty().put(`/exams/${round1}/audience`, { assignToAll: true });
    expect((await faculty().post(`/exams/${round1}/publish`)).status).toBe(200);
  });
  afterAll(async () => {
    await app.close();
  });

  it('students score 100%, 75% and 25%', async () => {
    const right = [4, 3, 1];
    for (const [i, s] of students.entries()) {
      const me = api(app, s.token);
      const st = await me.post(`/my/exams/${round1}/start`);
      let n = 0;
      for (const q of st.body.questions as {
        id: string;
        options: { id: string; text: string }[];
      }[]) {
        const text = n++ < right[i]! ? 'Right' : 'Wrong';
        await me
          .post(`/my/attempts/${st.body.attemptId}/answers`, {
            questionId: q.id,
            answer: q.options.find((o) => o.text === text)!.id,
          })
          .set('X-Attempt-Session', st.body.sessionId);
      }
      await me
        .post(`/my/attempts/${st.body.attemptId}/submit`)
        .set('X-Attempt-Session', st.body.sessionId);
    }
    const a = await faculty().get(`/exams/${round1}/analytics`);
    expect(a.body.candidates.map((c: { percentage: number }) => c.percentage)).toEqual([
      100, 75, 25,
    ]);
  });

  it('faculty set the pass mark after the exam; every result is marked again', async () => {
    expect(
      (
        await api(app, viewerTok)
          .put(`/exams/${round1}/pass-mark`, { passPct: 70 })
          .set('X-Org-Id', orgA)
      ).status,
    ).toBe(403);
    expect((await faculty().put(`/exams/${round1}/pass-mark`, { passPct: 101 })).status).toBe(422);
    const r = await faculty().put(`/exams/${round1}/pass-mark`, { passPct: 75 });
    expect(r.status).toBe(200);
    expect(r.body.passPct).toBe(75);
    const a = await faculty().get(`/exams/${round1}/analytics`);
    expect(a.body.candidates.map((c: { passed: boolean }) => c.passed)).toEqual([
      true,
      true,
      false,
    ]);
    expect(a.body.stats.passed).toBe(2);
    await faculty().put(`/exams/${round1}/pass-mark`, { passPct: 80 });
    const b = await faculty().get(`/exams/${round1}/analytics`);
    expect(b.body.candidates.map((c: { passed: boolean }) => c.passed)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('Round 2 goes only to the students who passed Round 1', async () => {
    const a = await faculty().get(`/exams/${round1}/analytics`);
    const passed = a.body.candidates
      .filter((c: { passed: boolean }) => c.passed)
      .map((c: { userId: string }) => c.userId);
    const set = await faculty().put(`/exams/${round2}/audience`, {
      assignToAll: false,
      userIds: passed,
    });
    expect(set.body.assignedCount).toBe(1);
    expect((await faculty().post(`/exams/${round2}/publish`)).status).toBe(200);
    const see = async (i: number) =>
      (await api(app, students[i]!.token).get('/my/exams')).body.data?.some?.(
        (e: { id: string }) => e.id === round2,
      ) ??
      (await api(app, students[i]!.token).get('/my/exams')).body.some(
        (e: { id: string }) => e.id === round2,
      );
    expect(await see(0)).toBe(true);
    expect(await see(1)).toBe(false);
    expect(await see(2)).toBe(false);
  });
});
