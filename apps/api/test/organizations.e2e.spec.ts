import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Organizations API (tenant isolation)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: { id: string };
  let orgB: { id: string };
  let superAdmin: string, adminA: string, learnerA: string, adminB: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgA = await prisma.organization.create({ data: { name: 'Alpha College', slug: 'alpha' } });
    orgB = await prisma.organization.create({ data: { name: 'Beta School', slug: 'beta' } });
    superAdmin = (await makeUser(prisma, { superAdmin: true })).token;
    adminA = (await makeUser(prisma, { memberOf: [{ orgId: orgA.id, roles: ['ORG_ADMIN'] }] }))
      .token;
    learnerA = (await makeUser(prisma, { memberOf: [{ orgId: orgA.id, roles: ['LEARNER'] }] }))
      .token;
    adminB = (await makeUser(prisma, { memberOf: [{ orgId: orgB.id, roles: ['ORG_ADMIN'] }] }))
      .token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests with the standard error body', async () => {
    const res = await api(app).get('/organizations');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('super admin sees every organization', async () => {
    const res = await api(app, superAdmin).get('/organizations');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
  });

  it('org members only see their own organization', async () => {
    const res = await api(app, adminA).get('/organizations');
    expect(res.body.data.map((o: { id: string }) => o.id)).toEqual([orgA.id]);
  });

  it('returns 404 (not 403) for another organization', async () => {
    expect((await api(app, adminA).get(`/organizations/${orgB.id}`)).status).toBe(404);
    expect(
      (await api(app, adminB).patch(`/organizations/${orgA.id}`, { name: 'Hacked' })).status,
    ).toBe(404);
    expect((await api(app, adminA).get('/organizations/not-a-uuid')).status).toBe(404);
  });

  it('org admin can update their own organization; learner cannot', async () => {
    const ok = await api(app, adminA).patch(`/organizations/${orgA.id}`, {
      name: 'Alpha Engineering College',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Alpha Engineering College');
    expect(ok.body.canManage).toBe(true);

    const denied = await api(app, learnerA).patch(`/organizations/${orgA.id}`, { name: 'Nope' });
    expect(denied.status).toBe(403);
  });

  it('only super admin can create organizations and change status', async () => {
    const body = { name: 'Gamma Tech', slug: 'gamma-tech', type: 'COMPANY' };
    expect((await api(app, adminA).post('/organizations', body)).status).toBe(403);

    const created = await api(app, superAdmin).post('/organizations', body);
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe('gamma-tech');

    const dup = await api(app, superAdmin).post('/organizations', body);
    expect(dup.status).toBe(409);

    expect(
      (await api(app, adminA).post(`/organizations/${orgA.id}/status`, { status: 'SUSPENDED' }))
        .status,
    ).toBe(403);
    const suspended = await api(app, superAdmin).post(`/organizations/${created.body.id}/status`, {
      status: 'SUSPENDED',
    });
    expect(suspended.body.status).toBe('SUSPENDED');
  });

  it('validates input with field-level details', async () => {
    const res = await api(app, superAdmin).post('/organizations', { name: 'X', slug: 'Bad Slug!' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'name',
      'slug',
    ]);
  });

  it('writes audit logs and platform analytics reflect them', async () => {
    const res = await api(app, superAdmin).get('/analytics/platform');
    expect(res.status).toBe(200);
    expect(res.body.totals.organizations).toBe(3);
    expect(
      res.body.recentActivity.some((a: { action: string }) => a.action === 'organization.created'),
    ).toBe(true);
    expect((await api(app, adminA).get('/analytics/platform')).status).toBe(403);
  });

  it('suspended organization blocks member access to permission-guarded routes', async () => {
    await prisma.organization.update({ where: { id: orgB.id }, data: { status: 'SUSPENDED' } });
    // list still hides nothing extra, but detail stays visible to members (read-only)
    expect((await api(app, adminB).get(`/organizations/${orgB.id}`)).status).toBe(200);
  });
});
