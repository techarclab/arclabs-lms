import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('College access code (faculty, read-only)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let otherId: string;
  let admin: string;
  let learner: string;
  let code: string;
  let token: string;
  let examId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgId = (await prisma.organization.create({ data: { name: 'MREC', slug: 'mrec' } })).id;
    otherId = (await prisma.organization.create({ data: { name: 'Other', slug: 'other' } })).id;
    await prisma.department.create({ data: { organizationId: orgId, name: 'CSE' } });
    admin = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_ADMIN'] }] })).token;
    learner = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] })).token;
    examId = (
      await prisma.quiz.create({
        data: { organizationId: orgId, title: 'Mid test', status: 'PUBLISHED', assignToAll: true },
      })
    ).id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('admins generate a code that is shown once and stored only as a hash', async () => {
    expect((await orgApi(app, learner, orgId).post('/access-code')).status).toBe(403);
    const s0 = await orgApi(app, admin, orgId).get('/access-code');
    expect(s0.body).toMatchObject({ enabled: false, hint: null, activeSessions: 0 });

    const g = await orgApi(app, admin, orgId).post('/access-code');
    expect(g.status).toBe(200);
    code = g.body.code;
    expect(code).toMatch(/^ARC(-[A-HJKMNP-Z2-9]{4}){5}$/);
    expect(g.body).toMatchObject({ enabled: true, hint: code.slice(-4) });

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.accessCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(org)).not.toContain(code.slice(4, 14));
    const again = await orgApi(app, admin, orgId).get('/access-code');
    expect(again.body.code).toBeUndefined();
  });

  it('logs in with the code (any case / spacing) and rejects wrong codes', async () => {
    const bad = await api(app).post('/access/login', { code: 'ARC-AAAA-BBBB-CCCC-DDDD-EEEE' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('ACCESS_CODE_INVALID');

    const r = await api(app).post('/access/login', {
      code: ` ${code.toLowerCase().replace(/-/g, ' ')} `,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ organizationId: orgId, organizationName: 'MREC' });
    token = r.body.token;
    expect(token.startsWith('acc_')).toBe(true);

    const me = await api(app, token).get('/access/me');
    expect(me.body).toMatchObject({
      accessCode: true,
      isSuperAdmin: false,
      memberships: [{ organizationId: orgId, roles: ['ORG_VIEWER'] }],
    });
    expect((await orgApi(app, admin, orgId).get('/access-code')).body.activeSessions).toBe(1);
  });

  it('can view results, people and departments of its own college only', async () => {
    const v = orgApi(app, token, orgId);
    expect((await v.get('/exams')).status).toBe(200);
    expect((await v.get(`/exams/${examId}/analytics`)).status).toBe(200);
    expect((await v.get('/members')).status).toBe(200);
    expect((await v.get('/members/summary')).status).toBe(200);
    expect((await v.get('/departments')).status).toBe(200);
    // Another college
    expect((await orgApi(app, token, otherId).get('/exams')).status).toBe(403);
  });

  it('cannot change anything or reach personal routes', async () => {
    const v = orgApi(app, token, orgId);
    expect((await v.post('/exams', { title: 'X' })).status).toBe(403);
    expect((await v.post('/departments', { name: 'ECE' })).status).toBe(403);
    expect((await v.post('/members', { email: 'a@b.c', roles: ['LEARNER'] })).status).toBe(403);
    expect((await v.get('/join-settings')).status).toBe(403);
    expect((await v.post('/access-code')).status).toBe(403);
    expect((await v.post(`/exams/${examId}/evaluate-coding`)).status).toBe(403);
    expect((await api(app, token).get('/my/exams')).status).toBe(403);
    expect((await api(app, token).get('/auth/me')).status).toBe(403);
    expect((await api(app, token).get('/organizations')).status).toBe(403);
    // Firebase users can't call the access-code-only routes
    expect((await api(app, admin).get('/access/me')).status).toBe(401);
  });

  it('regenerating signs everyone out; the old code stops working; disabling turns it off', async () => {
    const g = await orgApi(app, admin, orgId).post('/access-code');
    expect(g.body.code).not.toBe(code);
    expect((await api(app, token).get('/access/me')).status).toBe(401);
    expect((await api(app).post('/access/login', { code })).status).toBe(401);

    const r = await api(app).post('/access/login', { code: g.body.code });
    expect(r.status).toBe(200);
    const t2 = r.body.token;
    expect((await api(app, t2).post('/access/logout')).status).toBe(204);
    expect((await api(app, t2).get('/access/me')).status).toBe(401);

    const r2 = await api(app).post('/access/login', { code: g.body.code });
    const off = await orgApi(app, admin, orgId).delete('/access-code');
    expect(off.body).toMatchObject({ enabled: false, activeSessions: 0 });
    expect((await api(app, r2.body.token).get('/access/me')).status).toBe(401);
    expect((await api(app).post('/access/login', { code: g.body.code })).status).toBe(401);
  });
});
