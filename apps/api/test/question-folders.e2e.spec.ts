import type { INestApplication } from '@nestjs/common';
import { createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const mcq = (prompt: string) => ({
  type: 'SINGLE_CHOICE',
  prompt,
  options: [
    { text: 'Yes', correct: true },
    { text: 'No', correct: false },
  ],
});

describe('Question folders: each imported paper stays separate', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let staff: string;
  let learner: string;
  const S = () => orgApi(app, staff, orgId);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgId = (await prisma.organization.create({ data: { name: 'F College', slug: 'f' } })).id;
    staff = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['INSTRUCTOR'] }] })).token;
    learner = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] })).token;
  });
  afterAll(async () => {
    await app.close();
  });

  it('imports each paper into its own folder; the same question can be in two papers', async () => {
    const u1 = await S().post('/questions/bulk', {
      folder: 'Unit 1 assignment',
      questions: [mcq('What is RS-485?'), mcq('What is Modbus?'), mcq('Shared question?')],
    });
    expect(u1.status).toBe(201);
    expect(u1.body).toMatchObject({ created: 3, skipped: 0, folder: 'Unit 1 assignment' });

    // "unit 3" with different case/spaces still lands in one folder; a question that's in Unit 1
    // is still added to Unit 3, but a repeat inside Unit 3 is skipped
    const u3 = await S().post('/questions/bulk', {
      folder: '  Unit 3 ',
      questions: [mcq('What is CAN?'), mcq('Shared question?')],
    });
    expect(u3.body).toMatchObject({ created: 2, skipped: 0, folder: 'Unit 3' });
    const again = await S().post('/questions/bulk', {
      folder: 'unit 3',
      questions: [mcq('What is CAN?'), mcq('What is PTP?')],
    });
    expect(again.body).toMatchObject({ created: 1, skipped: 1, folder: 'Unit 3' });

    // the parse step marks "already in the bank" only for the chosen folder
    const text = '1. Shared question?\nA) Yes\nB) No\nAnswer: A';
    const p1 = await S().post('/questions/import/parse', { text, useAi: false, folder: 'Unit 9' });
    expect(p1.body.questions[0].duplicate).toBe(false);
    const p2 = await S().post('/questions/import/parse', {
      text,
      useAi: false,
      folder: 'unit 1 assignment',
    });
    expect(p2.body.questions[0].duplicate).toBe(true);
    const p3 = await S().post('/questions/import/parse', { text, useAi: false });
    expect(p3.body.questions[0].duplicate).toBe(true);

    await S().post('/questions', mcq('Loose question?'));

    const f = await S().get('/questions/folders');
    expect(f.body).toEqual({
      folders: [
        { name: 'Unit 1 assignment', count: 3 },
        { name: 'Unit 3', count: 3 },
      ],
      unfiled: 1,
    });

    const list = await S().get('/questions?folder=Unit%203&pageSize=100');
    expect(list.body.meta.total).toBe(3);
    expect(list.body.data.every((q: { folder: string }) => q.folder === 'Unit 3')).toBe(true);
    // in the paper's order
    expect(list.body.data.map((q: { prompt: string }) => q.prompt)).toEqual([
      'What is CAN?',
      'Shared question?',
      'What is PTP?',
    ]);
    const none = await S().get('/questions?folder=__none__');
    expect(none.body.data.map((q: { prompt: string }) => q.prompt)).toEqual(['Loose question?']);
  });

  it('moves questions between folders, renames folders, and keeps the folder on edit', async () => {
    const loose = (await S().get('/questions?folder=__none__')).body.data[0];
    const mv = await S().post('/questions/move', { ids: [loose.id], folder: 'unit 3' });
    expect(mv.body).toEqual({ moved: 1, folder: 'Unit 3' });

    // editing without sending a folder keeps it; sending "" takes it out
    const kept = await S().put(`/questions/${loose.id}`, mcq('Loose question, edited?'));
    expect(kept.body.folder).toBe('Unit 3');
    const out = await S().put(`/questions/${loose.id}`, { ...mcq('Loose question?'), folder: '' });
    expect(out.body.folder).toBeNull();
    const back = await S().put(`/questions/${loose.id}`, { ...mcq('Loose?'), folder: 'Unit 3' });
    expect(back.body.folder).toBe('Unit 3');
    expect((await S().post(`/questions/${loose.id}/duplicate`)).body.folder).toBe('Unit 3');

    const rn = await S().post('/questions/folders/rename', { from: 'Unit 3', to: 'Unit 3 - IIoT' });
    expect(rn.body).toEqual({ renamed: 5, folder: 'Unit 3 - IIoT' });
    expect((await S().post('/questions/folders/rename', { from: 'Nope', to: 'X' })).status).toBe(
      404,
    );
    expect((await S().post('/questions/move', { ids: [], folder: 'X' })).status).toBe(422);

    // learners can't see or change the bank
    expect((await orgApi(app, learner, orgId).get('/questions/folders')).status).toBe(403);
    expect(
      (await orgApi(app, learner, orgId).post('/questions/move', { ids: [loose.id], folder: 'X' }))
        .status,
    ).toBe(403);
  });
});
