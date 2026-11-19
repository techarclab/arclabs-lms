import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Exam sections', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: string;
  let facultyTok: string;
  let learnerTok: string;
  let examId: string;
  const apt: string[] = [];
  const tech: string[] = [];

  const faculty = () => orgApi(app, facultyTok, orgA);
  const me = () => api(app, learnerTok);

  const question = async (prompt: string, folder: string) =>
    (
      await faculty().post('/questions', {
        type: 'SINGLE_CHOICE',
        prompt,
        points: 1,
        folder,
        options: [
          { text: 'Right', correct: true },
          { text: 'Wrong', correct: false },
        ],
      })
    ).body.id as string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgA = (await prisma.organization.create({ data: { name: 'Hiring', slug: 'hiring' } })).id;
    facultyTok = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['INSTRUCTOR'] }] }))
      .token;
    learnerTok = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] }))
      .token;
    for (let i = 1; i <= 4; i++) apt.push(await question(`Aptitude ${i}`, 'Aptitude'));
    for (let i = 1; i <= 4; i++) tech.push(await question(`Technical ${i}`, 'Technical'));
    examId = (
      await faculty().post('/exams', {
        title: 'Round 1',
        durationMinutes: 90,
        requireCamera: false,
        shuffleQuestions: true,
        sectionsInOrder: false, // free movement; one-at-a-time is tested in sections-in-order
      })
    ).body.id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('saves a section per question and keeps each section together', async () => {
    // Mixed order on purpose: the server groups them by section.
    const ids = [apt[0]!, tech[0]!, apt[1]!, tech[1]!, apt[2]!, tech[2]!, apt[3]!, tech[3]!];
    const sections = ids.map((id) => (apt.includes(id) ? 'Aptitude' : 'Technical'));
    const bad = await faculty().put(`/exams/${examId}/questions`, {
      questionIds: ids,
      sections: ['Aptitude'],
    });
    expect(bad.status).toBe(422);
    const r = await faculty().put(`/exams/${examId}/questions`, { questionIds: ids, sections });
    expect(r.status).toBe(200);
    expect(r.body.questions.map((q: { section: string }) => q.section)).toEqual([
      ...Array(4).fill('Aptitude'),
      ...Array(4).fill('Technical'),
    ]);
    // Re-ordering without sections keeps the sections each question already had.
    const kept = await faculty().put(`/exams/${examId}/questions`, {
      questionIds: [...tech, ...apt],
    });
    expect(kept.body.questions.map((q: { section: string }) => q.section)).toEqual([
      ...Array(4).fill('Technical'),
      ...Array(4).fill('Aptitude'),
    ]);
    await faculty().put(`/exams/${examId}/questions`, {
      questionIds: [...apt, ...tech],
      sections: [...apt.map(() => 'Aptitude'), ...tech.map(() => 'Technical')],
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

  it('students get the sections in order, shuffled only inside each section', async () => {
    const s = await me().post(`/my/exams/${examId}/start`);
    expect(s.status).toBe(200);
    const qs = s.body.questions as {
      id: string;
      section: string;
      options: { id: string; text: string }[];
    }[];
    expect(qs.map((q) => q.section)).toEqual([
      ...Array(4).fill('Aptitude'),
      ...Array(4).fill('Technical'),
    ]);
    expect(new Set(qs.slice(0, 4).map((q) => q.id))).toEqual(new Set(apt));

    // All aptitude right, one technical right.
    const save = (q: (typeof qs)[number], text: string) =>
      me()
        .post(`/my/attempts/${s.body.attemptId}/answers`, {
          questionId: q.id,
          answer: q.options.find((o) => o.text === text)!.id,
        })
        .set('X-Attempt-Session', s.body.sessionId);
    for (const q of qs.slice(0, 4)) await save(q, 'Right');
    await save(qs[4]!, 'Right');
    await save(qs[5]!, 'Wrong');
    const res = await me()
      .post(`/my/attempts/${s.body.attemptId}/submit`)
      .set('X-Attempt-Session', s.body.sessionId);
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(5);
    expect(res.body.bySection).toEqual([
      { name: 'Aptitude', questions: 4, marks: 4, maxMarks: 4, pct: 100 },
      { name: 'Technical', questions: 4, marks: 1, maxMarks: 4, pct: 25 },
    ]);
  });

  it('faculty see marks per section in results and the CSV', async () => {
    const a = await faculty().get(`/exams/${examId}/analytics`);
    expect(a.body.sections).toEqual([
      { name: 'Aptitude', questions: 4, maxMarks: 4 },
      { name: 'Technical', questions: 4, maxMarks: 4 },
    ]);
    const row = a.body.candidates.find((c: { status: string }) => c.status === 'SUBMITTED');
    expect(row.sectionMarks).toEqual([4, 1]);
    const detail = await faculty().get(`/exams/${examId}/attempts/${row.attemptId}`);
    expect(detail.body.review[0].section).toBe('Aptitude');
    const csv = await faculty().get(`/exams/${examId}/results.csv`);
    const [header, line] = csv.text.replace('﻿', '').split('\r\n');
    expect(header).toContain('Aptitude (out of 4),Technical (out of 4)');
    expect(line!.endsWith(',4,1')).toBe(true);
  });
});
