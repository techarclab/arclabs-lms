import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

// 1x1 white JPEG
const JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

describe('Camera AI events and evidence photos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let staff: string;
  let viewer: string;
  let learner: string;
  let examId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgId = (await prisma.organization.create({ data: { name: 'Cam College', slug: 'cam' } })).id;
    staff = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['INSTRUCTOR'] }] })).token;
    viewer = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_VIEWER'] }] })).token;
    learner = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] })).token;
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
          title: 'Camera test',
          status: 'PUBLISHED',
          assignToAll: true,
          timeLimitMinutes: 10,
          maxViolations: 3,
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

  it('counts camera AI events and keeps the photo as evidence for staff', async () => {
    const s = await api(app, learner).post(`/my/exams/${examId}/start`);
    const ev = (body: object) =>
      api(app, learner)
        .post(`/my/attempts/${s.body.attemptId}/events`, body)
        .set('X-Attempt-Session', s.body.sessionId);

    const bad = await ev({ type: 'PHONE_DETECTED', snapshot: 'data:text/html;base64,PGgxPg==' });
    expect(bad.status).toBe(422);

    const phone = await ev({ type: 'PHONE_DETECTED', snapshot: JPEG, meta: { score: 0.8 } });
    expect(phone.body).toMatchObject({ violationCount: 1, autoSubmitted: false, remaining: 2 });

    const shots = await orgApi(app, staff, orgId).get(
      `/exams/${examId}/attempts/${s.body.attemptId}/snapshots`,
    );
    expect(shots.body).toEqual([
      expect.objectContaining({ eventType: 'PHONE_DETECTED', image: JPEG }),
    ]);
    // coordinators (view-only) can see evidence too; students cannot
    expect(
      (
        await orgApi(app, viewer, orgId).get(
          `/exams/${examId}/attempts/${s.body.attemptId}/snapshots`,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await orgApi(app, learner, orgId).get(
          `/exams/${examId}/attempts/${s.body.attemptId}/snapshots`,
        )
      ).status,
    ).toBe(403);
  });

  it('face missing / looking away are flagged with a photo but never auto-submit', async () => {
    const other = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] })).token;
    const s = await api(app, other).post(`/my/exams/${examId}/start`);
    const ev = (body: object) =>
      api(app, other)
        .post(`/my/attempts/${s.body.attemptId}/events`, body)
        .set('X-Attempt-Session', s.body.sessionId);
    for (const type of ['LOOKING_AWAY', 'FACE_MISSING', 'LOOKING_AWAY', 'FACE_MISSING']) {
      const r = await ev({ type, snapshot: JPEG });
      expect(r.body).toMatchObject({ violationCount: 0, autoSubmitted: false });
    }
    const shots = await orgApi(app, staff, orgId).get(
      `/exams/${examId}/attempts/${s.body.attemptId}/snapshots`,
    );
    expect(shots.body).toHaveLength(4);
    // another person staying in view still counts
    const person = await ev({ type: 'MULTIPLE_FACES', snapshot: JPEG });
    expect(person.body).toMatchObject({ violationCount: 1, remaining: 2 });
  });
});
