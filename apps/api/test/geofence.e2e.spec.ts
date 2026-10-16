import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const CAMPUS = { lat: 17.4206, lng: 78.6552 };
const north = (m: number, accuracy = 20) => ({
  lat: CAMPUS.lat + m / 111_195,
  lng: CAMPUS.lng,
  accuracy,
});

describe('On-campus exams (geofence)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: string;
  let adminTok: string;
  let facultyTok: string;
  let l1: string;
  let l2: string;
  let examId: string;

  const admin = () => orgApi(app, adminTok, orgA);
  const faculty = () => orgApi(app, facultyTok, orgA);
  const me = (t: string) => api(app, t);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgA = (await prisma.organization.create({ data: { name: 'Anurag', slug: 'anurag' } })).id;
    adminTok = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['ORG_ADMIN'] }] }))
      .token;
    facultyTok = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['INSTRUCTOR'] }] }))
      .token;
    l1 = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] })).token;
    l2 = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['LEARNER'] }] })).token;
  });
  afterAll(async () => {
    await app.close();
  });

  it('college admins set the campus; coordinates and map links need no search', async () => {
    expect((await faculty().put('/campus', { ...CAMPUS, radiusM: 300 })).status).toBe(403);
    expect((await admin().put('/campus', { ...CAMPUS, radiusM: 20 })).status).toBe(422);
    const set = await admin().put('/campus', {
      address: 'Anurag University, Venkatapur',
      ...CAMPUS,
      radiusM: 300,
    });
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ address: 'Anurag University, Venkatapur', ...CAMPUS, radiusM: 300 });
    expect((await faculty().get('/campus')).body.radiusM).toBe(300);
    const g = await admin().get(
      `/campus/geocode?q=${encodeURIComponent('https://www.google.com/maps/@17.4206,78.6552,17z')}`,
    );
    expect(g.body).toEqual([{ label: '17.420600, 78.655200', lat: 17.4206, lng: 78.6552 }]);
  });

  it('an on-campus exam needs the campus before publishing', async () => {
    const q = await faculty().post('/questions', {
      type: 'SINGLE_CHOICE',
      prompt: 'MQTT TLS port?',
      points: 1,
      options: [
        { text: '8883', correct: true },
        { text: '1883', correct: false },
      ],
    });
    examId = (
      await faculty().post('/exams', {
        title: 'Unit 5',
        durationMinutes: 30,
        requireOnCampus: true,
        requireCamera: false,
        maxViolations: 3,
      })
    ).body.id;
    await faculty().put(`/exams/${examId}/questions`, { questionIds: [q.body.id] });
    await faculty().put(`/exams/${examId}/audience`, { assignToAll: true });
    const now = Date.now();
    await faculty().patch(`/exams/${examId}`, {
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString(),
    });
    await admin().put('/campus', { lat: null, lng: null, radiusM: 300 });
    const blocked = await faculty().get(`/exams/${examId}`);
    expect(blocked.body.requireOnCampus).toBe(true);
    expect(blocked.body.publishIssues.join(' ')).toContain('campus location');
    await admin().put('/campus', {
      address: 'Anurag University, Venkatapur',
      ...CAMPUS,
      radiusM: 300,
    });
    expect((await faculty().post(`/exams/${examId}/publish`)).status).toBe(200);
  });

  it('students can start only from within the radius', async () => {
    const lobby = await me(l1).get(`/my/exams/${examId}`);
    expect(lobby.body.campus).toEqual({ radiusM: 300, address: 'Anurag University, Venkatapur' });

    const none = await me(l1).post(`/my/exams/${examId}/start`);
    expect(none.status).toBe(403);
    expect(none.body.error.code).toBe('LOCATION_REQUIRED');

    const home = await me(l1).post(`/my/exams/${examId}/start`, { location: north(4200) });
    expect(home.status).toBe(403);
    expect(home.body.error).toMatchObject({
      code: 'OFF_CAMPUS',
      details: { distanceM: 4200, radiusM: 300 },
    });
    expect(home.body.error.message).toContain('4.2 km');

    const rough = await me(l1).post(`/my/exams/${examId}/start`, {
      location: north(3000, 5000),
    });
    expect(rough.body.error.code).toBe('LOCATION_IMPRECISE');

    const ok = await me(l1).post(`/my/exams/${examId}/start`, { location: north(150) });
    expect(ok.status).toBe(200);
    expect(ok.body.requireOnCampus).toBe(true);
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({
      where: { id: ok.body.attemptId },
    });
    expect(attempt).toMatchObject({ startDistanceM: 150, startAccuracyM: 20 });
  });

  it('leaving the campus during the exam is flagged once every few minutes; faculty see it', async () => {
    const s = await me(l2).post(`/my/exams/${examId}/start`, { location: north(50) });
    const beat = (body: object) =>
      me(l2)
        .post(`/my/attempts/${s.body.attemptId}/heartbeat`, body)
        .set('X-Attempt-Session', s.body.sessionId);

    const inside = await beat({ location: north(80) });
    expect(inside.body).toMatchObject({ outsideCampus: null, violationCount: 0 });
    const out = await beat({ location: north(2500) });
    expect(out.body).toMatchObject({
      outsideCampus: { distanceM: 2500, radiusM: 300 },
      violationCount: 1,
      autoSubmitted: false,
    });
    const again = await beat({ location: north(2600) }); // within 5 minutes: not counted again
    expect(again.body).toMatchObject({ violationCount: 1 });
    expect((await beat({ locationError: 'DENIED' })).status).toBe(200);
    expect((await beat({})).body.outsideCampus).toBeNull(); // old clients send nothing

    const detail = await faculty().get(`/exams/${examId}/attempts/${s.body.attemptId}`);
    expect(detail.body.location).toMatchObject({ distanceM: 50, accuracyM: 20 });
    const types = detail.body.events.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(['OUTSIDE_CAMPUS', 'LOCATION_OFF']));

    // Coming back to the exam from home is refused, and logged on the attempt
    const resume = await me(l2).post(`/my/exams/${examId}/start`, { location: north(3000) });
    expect(resume.body.error.code).toBe('OFF_CAMPUS');
  });

  it('faculty can switch the campus check off on a published exam', async () => {
    const r = await faculty().patch(`/exams/${examId}`, { requireOnCampus: false });
    expect(r.status).toBe(200);
    expect((await me(l2).get(`/my/exams/${examId}`)).body.campus).toBeNull();
    const resume = await me(l2).post(`/my/exams/${examId}/start`);
    expect(resume.status).toBe(200);
  });
});
