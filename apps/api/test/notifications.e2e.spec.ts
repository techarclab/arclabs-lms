import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Notification bell', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: string;
  let staffTok: string;
  let learner: string;
  let examId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgA = (await prisma.organization.create({ data: { name: 'ECE College', slug: 'ece' } })).id;
    staffTok = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['INSTRUCTOR'] }] }))
      .token;
    learner = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] })).token;
  });
  afterAll(async () => {
    await app.close();
  });

  it('shows live exams to students and staff, and counts unread until the bell is opened', async () => {
    const staff = orgApi(app, staffTok, orgA);
    const q = await staff.post('/questions', {
      type: 'SINGLE_CHOICE',
      prompt: 'MQTT TLS port?',
      points: 1,
      options: [
        { text: '8883', correct: true },
        { text: '1883', correct: false },
      ],
    });
    examId = (await staff.post('/exams', { title: 'Unit 5 test', durationMinutes: 30 })).body.id;
    await staff.put(`/exams/${examId}/questions`, { questionIds: [q.body.id] });
    await staff.put(`/exams/${examId}/audience`, { assignToAll: true });
    const now = Date.now();
    await staff.patch(`/exams/${examId}`, {
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    });
    expect((await staff.post(`/exams/${examId}/publish`)).status).toBe(200);

    const feed = await api(app, learner).get('/notifications');
    expect(feed.status).toBe(200);
    expect(feed.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'EXAM_LIVE',
          title: 'Exam is live: Unit 5 test',
          link: `/exam/${examId}`,
          unread: true,
        }),
      ]),
    );
    expect(feed.body.unread).toBeGreaterThan(0);

    expect((await api(app, learner).post('/notifications/seen')).status).toBe(200);
    const after = await api(app, learner).get('/notifications');
    expect(after.body.unread).toBe(0);
    expect(after.body.items.length).toBe(feed.body.items.length);

    const staffFeed = await api(app, staffTok).get('/notifications');
    expect(staffFeed.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'STAFF_EXAM_LIVE',
          link: `/exams/${examId}/results`,
        }),
      ]),
    );
    // staff are not students: no "exam is live" item for them
    expect(staffFeed.body.items.some((i: { kind: string }) => i.kind === 'EXAM_LIVE')).toBe(false);
  });

  it('needs sign-in', async () => {
    expect((await api(app, '').get('/notifications')).status).toBe(401);
  });
});
