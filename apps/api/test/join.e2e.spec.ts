import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, fakeFirebaseUsers, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('College join links', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let admin: string;
  let learnerOther: string;
  let ece: string;
  let code: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgId = (
      await prisma.organization.create({ data: { name: 'Anurag University', slug: 'anurag' } })
    ).id;
    const other = (
      await prisma.organization.create({ data: { name: 'Other College', slug: 'other' } })
    ).id;
    ece = (await prisma.department.create({ data: { organizationId: orgId, name: 'ECE' } })).id;
    admin = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_ADMIN'] }] })).token;
    learnerOther = (await makeUser(prisma, { memberOf: [{ orgId: other, roles: ['LEARNER'] }] }))
      .token;
  });
  afterAll(async () => {
    await app.close();
  });

  it('cannot be switched on before the college has departments', async () => {
    const empty = (
      await prisma.organization.create({ data: { name: 'Empty College', slug: 'empty' } })
    ).id;
    const emptyAdmin = (
      await makeUser(prisma, { memberOf: [{ orgId: empty, roles: ['ORG_ADMIN'] }] })
    ).token;
    const r = await orgApi(app, emptyAdmin, empty).put('/join-settings', { enabled: true });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('NO_DEPARTMENTS');
  });

  it('is closed until an admin enables it; only admins can manage it', async () => {
    const s = await orgApi(app, admin, orgId).get('/join-settings');
    expect(s.body).toMatchObject({ enabled: false, code: null });
    expect((await orgApi(app, learnerOther, orgId).get('/join-settings')).status).toBe(403);

    const on = await orgApi(app, admin, orgId).put('/join-settings', { enabled: true });
    expect(on.body.enabled).toBe(true);
    expect(on.body.code).toMatch(/^ANURAG-[A-Z2-9]{4}$/);
    code = on.body.code;
  });

  it('shows public college info for a valid code (case-insensitive), 404 otherwise', async () => {
    const info = await api(app).get(`/join/${code.toLowerCase()}`);
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({
      organizationName: 'Anurag University',
      departments: [{ name: 'ECE' }],
    });
    expect((await api(app).get('/join/NOPE-1234')).status).toBe(404);
  });

  it('registers a brand-new student as a learner with roll no. and department', async () => {
    const uid = 'uid-newstudent';
    fakeFirebaseUsers.set('ravi@anurag.edu.in', { uid, email: 'ravi@anurag.edu.in' });
    expect((await api(app).post(`/join/${code}`, { fullName: 'Ravi Teja' })).status).toBe(401);
    // Every field is required: roll number and department too.
    const missing = await api(app, uid).post(`/join/${code}`, { fullName: 'Ravi Teja' });
    expect(missing.status).toBe(422);
    expect(
      (
        await api(app, uid).post(`/join/${code}`, {
          fullName: 'Ravi Teja',
          externalId: '22eg105a01',
        })
      ).status,
    ).toBe(422);
    const res = await api(app, uid).post(`/join/${code}`, {
      fullName: 'Ravi Teja',
      externalId: '22eg105a01',
      departmentId: ece,
      collegeEmail: 'Ravi@Anurag.edu.in',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ organizationName: 'Anurag University', alreadyMember: false });

    const me = await api(app, uid).get('/auth/me');
    expect(me.body.memberships).toEqual([
      expect.objectContaining({ organizationId: orgId, roles: ['LEARNER'] }),
    ]);
    const m = await prisma.organizationMember.findFirst({
      where: { organizationId: orgId, user: { firebaseUid: uid } },
    });
    expect(m).toMatchObject({
      externalId: '22EG105A01',
      departmentId: ece,
      collegeEmail: 'ravi@anurag.edu.in',
    });

    const again = await api(app, uid).post(`/join/${code}`, {
      fullName: 'Ravi Teja',
      externalId: '22EG105A01',
      departmentId: ece,
      collegeEmail: 'ravi@anurag.edu.in',
    });
    expect(again.body.alreadyMember).toBe(true);
  });

  it('lets an existing user from another college join too, and rejects foreign departments', async () => {
    const otherDept = (
      await prisma.department.create({
        data: {
          organizationId: (
            await prisma.organization.findUniqueOrThrow({ where: { slug: 'other' } })
          ).id,
          name: 'X',
        },
      })
    ).id;
    expect(
      (
        await api(app, learnerOther).post(`/join/${code}`, {
          fullName: 'Someone',
          externalId: 'X1',
          departmentId: otherDept,
          collegeEmail: 'someone@anurag.edu.in',
        })
      ).status,
    ).toBe(400);
    const ok = await api(app, learnerOther).post(`/join/${code}`, {
      fullName: 'Someone',
      externalId: '22EG105A02',
      departmentId: ece,
      collegeEmail: 'someone@anurag.edu.in',
    });
    expect(ok.body.alreadyMember).toBe(false);
  });

  it('new learners automatically see exams assigned to all learners', async () => {
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
    const exam = await prisma.quiz.create({
      data: {
        organizationId: orgId,
        title: 'Entrance test',
        status: 'PUBLISHED',
        assignToAll: true,
        timeLimitMinutes: 10,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 3_600_000),
        questions: { create: [{ questionId: q.id, position: 0 }] },
      },
    });
    const mine = await api(app, 'uid-newstudent').get('/my/exams');
    expect(mine.body.map((e: { id: string }) => e.id)).toContain(exam.id);
  });

  it('regenerating the code kills the old link; disabling closes registration; deactivated members are refused', async () => {
    const r = await orgApi(app, admin, orgId).post('/join-settings/regenerate');
    expect(r.body.code).not.toBe(code);
    expect((await api(app).get(`/join/${code}`)).status).toBe(404);
    code = r.body.code;

    await prisma.organizationMember.updateMany({
      where: { organizationId: orgId, user: { firebaseUid: 'uid-newstudent' } },
      data: { status: 'INACTIVE' },
    });
    const refused = await api(app, 'uid-newstudent').post(`/join/${code}`, {
      fullName: 'Ravi Teja',
      externalId: '22EG105A01',
      departmentId: ece,
      collegeEmail: 'ravi@anurag.edu.in',
    });
    expect(refused.body.error.code).toBe('MEMBERSHIP_DISABLED');

    await orgApi(app, admin, orgId).put('/join-settings', { enabled: false });
    expect((await api(app).get(`/join/${code}`)).status).toBe(404);
    const audit = await prisma.auditLog.count({
      where: { organizationId: orgId, action: 'member.joined' },
    });
    expect(audit).toBe(2);
  });
});
