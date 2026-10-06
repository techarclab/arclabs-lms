import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, fakeFirebaseUsers, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('One student, one account: roll number and college email', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let ece: string;
  let admin: string;
  let code: string;
  const A = () => orgApi(app, admin, orgId);
  const student = async (externalId: string | null, collegeEmail: string | null) => {
    const s = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
    const m = await prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: orgId, userId: s.user.id } },
      data: { externalId, collegeEmail, departmentId: ece },
    });
    return { userId: s.user.id, memberId: m.id, firebaseUid: s.user.firebaseUid };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgId = (await prisma.organization.create({ data: { name: 'Dup College', slug: 'dup' } })).id;
    ece = (await prisma.department.create({ data: { organizationId: orgId, name: 'ECE' } })).id;
    admin = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_ADMIN'] }] })).token;
    code = (await A().put('/join-settings', { enabled: true })).body.code;
  });
  afterAll(async () => {
    await app.close();
  });

  it('finds students registered twice and merges them, keeping all their results', async () => {
    // registered before the rule existed: same roll number written differently
    const a = await student('21J41A0168', 'ravi@dup.edu');
    const b = await student('21j41a 0168', null);
    const c = await student('21J41A0170', 'sita@dup.edu');
    const d = await student('21J41A0171', 'SITA@dup.edu');
    await student('21J41A0199', 'solo@dup.edu');

    const quiz = await prisma.quiz.create({
      data: { organizationId: orgId, title: 'Unit 1', status: 'PUBLISHED' },
    });
    for (const [userId, pct] of [
      [a.userId, 40],
      [b.userId, 90],
    ] as const)
      await prisma.quizAttempt.create({
        data: {
          organizationId: orgId,
          quizId: quiz.id,
          userId,
          attemptNo: 1,
          status: 'GRADED',
          score: pct / 10,
          percentage: pct,
        },
      });
    const lab = await prisma.labAssessment.create({
      data: { organizationId: orgId, title: 'Lab 1', criteria: [] },
    });
    await prisma.labMark.create({ data: { assessmentId: lab.id, userId: b.userId, total: 8 } });

    const dups = await A().get('/members/duplicates');
    expect(dups.status).toBe(200);
    expect(dups.body).toHaveLength(2);
    const g1 = dups.body.find((g: { reasons: string[] }) =>
      g.reasons.includes('Roll no. 21J41A0168'),
    );
    expect(g1.members.map((m: { id: string }) => m.id).sort()).toEqual(
      [a.memberId, b.memberId].sort(),
    );
    expect(
      dups.body.some((g: { reasons: string[] }) =>
        g.reasons.includes('College email sita@dup.edu'),
      ),
    ).toBe(true);

    const r = await A().post('/members/merge', { keepId: a.memberId, mergeIds: [b.memberId] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ merged: 1, moved: { attempts: 1, labMarks: 1 } });

    // both attempts now belong to the kept student; the best one counts in results
    const atts = await prisma.quizAttempt.findMany({
      where: { quizId: quiz.id },
      orderBy: { attemptNo: 'asc' },
    });
    expect(atts.map((x) => [x.userId, x.attemptNo])).toEqual([
      [a.userId, 1],
      [a.userId, 2],
    ]);
    const res = await A().get(`/exams/${quiz.id}/analytics`);
    const row = res.body.candidates.find((x: { userId: string }) => x.userId === a.userId);
    expect(row.percentage).toBe(90);
    expect(await prisma.labMark.count({ where: { userId: a.userId } })).toBe(1);
    expect(await prisma.organizationMember.count({ where: { id: b.memberId } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.userId } })).status).toBe(
      'INACTIVE',
    );
    expect(await prisma.auditLog.count({ where: { action: 'member.merged' } })).toBe(1);

    // only the other group is left
    expect((await A().get('/members/duplicates')).body).toHaveLength(1);
    expect(
      (await A().post('/members/merge', { keepId: c.memberId, mergeIds: [c.memberId] })).status,
    ).toBe(422);
    await A().post('/members/merge', { keepId: c.memberId, mergeIds: [d.memberId] });
    expect((await A().get('/members/duplicates')).body).toEqual([]);
  });

  it('a student can’t register again with a roll number or college email already used', async () => {
    const uid = 'uid-second-account';
    fakeFirebaseUsers.set('ravi.other@gmail.com', { uid, email: 'ravi.other@gmail.com' });
    const r = await api(app, uid).post(`/join/${code}`, {
      fullName: 'Ravi',
      externalId: '21j41a0168',
      departmentId: ece,
      collegeEmail: 'new@dup.edu',
    });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('ROLL_NUMBER_TAKEN');
    expect(r.body.error.message).not.toContain('@gmail.com'); // the other account is masked
    const r2 = await api(app, uid).post(`/join/${code}`, {
      fullName: 'Ravi',
      externalId: '21J41A0500',
      departmentId: ece,
      collegeEmail: 'Ravi@dup.edu',
    });
    expect(r2.body.error.code).toBe('COLLEGE_EMAIL_TAKEN');
    const ok = await api(app, uid).post(`/join/${code}`, {
      fullName: 'Ravi',
      externalId: '21J41A0500',
      departmentId: ece,
      collegeEmail: 'ravi500@dup.edu',
    });
    expect(ok.status).toBe(200);
  });

  it('admins can’t give two people the same roll number either', async () => {
    const e = await student('21J41A0300', null);
    const clash = await A().patch(`/members/${e.memberId}`, { externalId: '21j41a0168' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.message).toContain('21J41A0168');
    const inv = await A().post('/members', {
      email: 'fresh@gmail.com',
      fullName: 'Fresh',
      roles: ['LEARNER'],
      externalId: '21J41A0300',
      sendEmail: false,
    });
    expect(inv.status).toBe(409);
    // keeping your own roll number is fine
    expect((await A().patch(`/members/${e.memberId}`, { externalId: '21J41A0300' })).status).toBe(
      200,
    );
  });
});
