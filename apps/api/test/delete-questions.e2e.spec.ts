import type { INestApplication } from '@nestjs/common';
import { createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Deleting questions and folders', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: string;
  let facultyTok: string;
  let learnerTok: string;
  const faculty = () => orgApi(app, facultyTok, orgA);
  const make = async (prompt: string, folder: string) =>
    (
      await faculty().post('/questions', {
        type: 'SINGLE_CHOICE',
        prompt,
        points: 1,
        folder,
        options: [
          { text: 'Yes', correct: true },
          { text: 'No', correct: false },
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
  });
  afterAll(async () => {
    await app.close();
  });

  it('deletes a whole folder; questions used in an exam are archived instead', async () => {
    const a = await make('Unused question one', 'Old paper');
    await make('Unused question two', 'Old paper');
    const used = await make('Question in an exam', 'Old paper');
    const keep = await make('Another folder question', 'Keep');
    const exam = (await faculty().post('/exams', { title: 'Round 1' })).body.id;
    await faculty().put(`/exams/${exam}/questions`, { questionIds: [used] });

    expect(
      (await orgApi(app, learnerTok, orgA).post('/questions/delete', { folder: 'Old paper' }))
        .status,
    ).toBe(403);
    const r = await faculty().post('/questions/delete', { folder: 'old paper' });
    expect(r.body).toEqual({ deleted: 2, archived: 1 });
    const folders = await faculty().get('/questions/folders');
    expect(folders.body.folders).toEqual([{ name: 'Keep', count: 1 }]);
    expect(await prisma.question.findUnique({ where: { id: a } })).toBeNull();
    expect(await prisma.question.findUnique({ where: { id: used } })).toMatchObject({
      archived: true,
      folder: null,
    });
    // The exam still has its question.
    expect((await faculty().get(`/exams/${exam}`)).body.questions).toHaveLength(1);
    expect(await prisma.question.findUnique({ where: { id: keep } })).not.toBeNull();
  });

  it('deletes chosen questions', async () => {
    const x = await make('Pick me one', 'Mixed');
    const y = await make('Pick me two', 'Mixed');
    const r = await faculty().post('/questions/delete', { ids: [x, y] });
    expect(r.body).toEqual({ deleted: 2, archived: 0 });
    expect((await faculty().post('/questions/delete', {})).status).toBe(422);
  });
});
