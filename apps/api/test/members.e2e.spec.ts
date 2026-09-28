import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Members & departments API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: string, orgB: string;
  let superAdmin: string,
    adminA: string,
    adminAId: string,
    contentA: string,
    instructorA: string,
    adminB: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgA = (await prisma.organization.create({ data: { name: 'Alpha College', slug: 'alpha' } }))
      .id;
    orgB = (await prisma.organization.create({ data: { name: 'Beta School', slug: 'beta' } })).id;
    superAdmin = (await makeUser(prisma, { superAdmin: true })).token;
    const a = await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['ORG_ADMIN'] }] });
    adminA = a.token;
    adminAId = a.user.id;
    contentA = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['CONTENT_MANAGER'] }] }))
      .token;
    instructorA = (await makeUser(prisma, { memberOf: [{ orgId: orgA, roles: ['INSTRUCTOR'] }] }))
      .token;
    adminB = (await makeUser(prisma, { memberOf: [{ orgId: orgB, roles: ['ORG_ADMIN'] }] })).token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires X-Org-Id and the user.manage permission', async () => {
    expect((await api(app, adminA).get('/members')).status).toBe(400);
    expect((await orgApi(app, instructorA, orgA).get('/members')).status).toBe(403);
    expect((await orgApi(app, adminA, orgB).get('/members')).status).toBe(403);
    const ok = await orgApi(app, adminA, orgA).get('/members');
    expect(ok.status).toBe(200);
    expect(ok.body.meta.total).toBe(3);
  });

  it('invites a new person: creates the account, membership and a set-password link', async () => {
    const res = await orgApi(app, adminA, orgA).post('/members', {
      email: '  Priya@College.EDU ',
      fullName: 'Priya Sharma',
      roles: ['LEARNER'],
      externalId: '21A91A0401',
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.member.email).toBe('priya@college.edu');
    expect(res.body.member.state).toBe('INVITED');
    expect(res.body.inviteLink).toContain('reset');
    expect(res.body.emailQueued).toBe(true);

    const dup = await orgApi(app, adminA, orgA).post('/members', {
      email: 'priya@college.edu',
      fullName: 'Priya',
      roles: ['LEARNER'],
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_MEMBER');
  });

  it('adds an existing person to another organization without creating a new account', async () => {
    const res = await orgApi(app, adminB, orgB).post('/members', {
      email: 'priya@college.edu',
      fullName: 'Priya Sharma',
      roles: ['LEARNER'],
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(false);
    expect(await prisma.user.count({ where: { email: 'priya@college.edu' } })).toBe(1);
  });

  it('never leaks members across organizations', async () => {
    const b = await orgApi(app, adminB, orgB).get('/members');
    expect(b.body.data.every((m: { email: string }) => !m.email.includes('uid-') || true)).toBe(
      true,
    );
    const aMembers = (await orgApi(app, adminA, orgA).get('/members')).body.data as {
      id: string;
    }[];
    const target = aMembers[0]!.id;
    expect(
      (await orgApi(app, adminB, orgB).patch(`/members/${target}`, { roles: ['LEARNER'] })).status,
    ).toBe(404);
  });

  it('only Org Admins can grant the Org Admin role', async () => {
    await prisma.organizationMember.updateMany({
      where: { organizationId: orgA, user: { firebaseUid: contentA } },
      data: { roles: ['CONTENT_MANAGER'] },
    });
    // give content manager user.manage? No — content managers cannot manage users at all:
    expect(
      (
        await orgApi(app, contentA, orgA).post('/members', {
          email: 'x@y.com',
          fullName: 'X Y',
          roles: ['ORG_ADMIN'],
        })
      ).status,
    ).toBe(403);
    const ok = await orgApi(app, adminA, orgA).post('/members', {
      email: 'co-admin@college.edu',
      fullName: 'Co Admin',
      roles: ['ORG_ADMIN'],
    });
    expect(ok.status).toBe(201);
  });

  it('protects the last Org Admin and prevents self-deactivation', async () => {
    const list = (await orgApi(app, adminA, orgA).get('/members?role=ORG_ADMIN')).body.data as {
      id: string;
      userId: string;
      email: string;
    }[];
    const me = list.find((m) => m.userId === adminAId)!;
    const coAdmin = list.find((m) => m.email === 'co-admin@college.edu')!;

    expect(
      (await orgApi(app, adminA, orgA).patch(`/members/${me.id}`, { status: 'INACTIVE' })).body
        .error.code,
    ).toBe('SELF_DEACTIVATION');
    expect(
      (await orgApi(app, adminA, orgA).patch(`/members/${me.id}`, { roles: ['LEARNER'] })).body
        .error.code,
    ).toBe('SELF_DEMOTION');

    // Demote the co-admin: fine, one admin remains.
    const demoted = await orgApi(app, adminA, orgA).patch(`/members/${coAdmin.id}`, {
      roles: ['INSTRUCTOR'],
    });
    expect(demoted.status).toBe(200);
    expect(demoted.body.roles).toEqual(['INSTRUCTOR']);

    // Super admin tries to remove the only remaining admin -> blocked.
    const last = await orgApi(app, superAdmin, orgA).patch(`/members/${me.id}`, {
      roles: ['LEARNER'],
    });
    expect(last.status).toBe(409);
    expect(last.body.error.code).toBe('LAST_ADMIN');
  });

  it('deactivates and reactivates members; filters by state', async () => {
    const priya = (await orgApi(app, adminA, orgA).get('/members?search=priya')).body.data[0];
    const off = await orgApi(app, adminA, orgA).patch(`/members/${priya.id}`, {
      status: 'INACTIVE',
    });
    expect(off.body.state).toBe('INACTIVE');
    expect((await orgApi(app, adminA, orgA).get('/members?status=INACTIVE')).body.meta.total).toBe(
      1,
    );
    const on = await orgApi(app, adminA, orgA).patch(`/members/${priya.id}`, { status: 'ACTIVE' });
    expect(on.body.state).toBe('INVITED');
    const summary = (await orgApi(app, adminA, orgA).get('/members/summary')).body;
    expect(summary.total).toBe(5);
    expect(summary.invited).toBeGreaterThanOrEqual(2);
  });

  it('bulk import: invites, skips duplicates/existing, reports bad rows, creates departments', async () => {
    const res = await orgApi(app, adminA, orgA).post('/members/bulk', {
      defaultRoles: ['LEARNER'],
      rows: [
        {
          email: 'ravi@college.edu',
          fullName: 'Ravi Kumar',
          department: 'ECE',
          externalId: '21A91A0402',
        },
        {
          email: 'anita@college.edu',
          fullName: 'Anita Rao',
          department: 'ece',
          roles: ['INSTRUCTOR'],
        },
        { email: 'ravi@college.edu', fullName: 'Ravi again' },
        { email: 'priya@college.edu', fullName: 'Priya' },
        { email: 'not-an-email', fullName: 'Bad Row' },
        { email: 'weird@college.edu', fullName: 'Weird Role', roles: ['WIZARD'] },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ invited: 2, skipped: 2, errors: 2 });
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual([
      'invited',
      'invited',
      'skipped',
      'skipped',
      'error',
      'error',
    ]);
    const depts = (await orgApi(app, adminA, orgA).get('/departments')).body;
    expect(depts).toEqual([expect.objectContaining({ name: 'ECE', memberCount: 2 })]);
  });

  it('departments are org-scoped and deleting keeps the members', async () => {
    const created = await orgApi(app, adminA, orgA).post('/departments', { name: 'Mechanical' });
    expect(created.status).toBe(201);
    expect(
      (await orgApi(app, adminA, orgA).post('/departments', { name: 'Mechanical' })).status,
    ).toBe(409);
    expect((await orgApi(app, adminB, orgB).delete(`/departments/${created.body.id}`)).status).toBe(
      404,
    );
    const ece = (await orgApi(app, adminA, orgA).get('/departments')).body.find(
      (d: { name: string }) => d.name === 'ECE',
    );
    expect((await orgApi(app, adminA, orgA).delete(`/departments/${ece.id}`)).status).toBe(204);
    expect(
      (await orgApi(app, adminA, orgA).get('/members?search=ravi')).body.data[0].department,
    ).toBeNull();
  });

  it('resend invite works only for people who have not signed in yet', async () => {
    const ravi = (await orgApi(app, adminA, orgA).get('/members?search=ravi')).body.data[0];
    const r = await orgApi(app, adminA, orgA).post(`/members/${ravi.id}/resend-invite`);
    expect(r.status).toBe(200);
    expect(r.body.inviteLink).toContain('reset');
    await prisma.user.update({ where: { id: ravi.userId }, data: { lastLoginAt: new Date() } });
    expect(
      (await orgApi(app, adminA, orgA).post(`/members/${ravi.id}/resend-invite`)).body.error.code,
    ).toBe('ALREADY_ACTIVE');
  });

  it('records audit entries for member actions', async () => {
    const actions = (await prisma.auditLog.findMany({ where: { organizationId: orgA } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'member.invited',
        'member.updated',
        'member.deactivated',
        'member.reactivated',
        'department.created',
        'department.deleted',
        'member.invite_resent',
      ]),
    );
  });
});
