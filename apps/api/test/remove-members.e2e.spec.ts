import type { INestApplication } from '@nestjs/common';
import { createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Remove people from a college', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let admin: { id: string; token: string };
  let instructor: string;
  const A = () => orgApi(app, admin.token, orgId);
  const memberId = async (userId: string) =>
    (await prisma.organizationMember.findFirstOrThrow({ where: { organizationId: orgId, userId } }))
      .id;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgId = (await prisma.organization.create({ data: { name: 'R College', slug: 'r' } })).id;
    const a = await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_ADMIN'] }] });
    admin = { id: a.user.id, token: a.token };
    instructor = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['INSTRUCTOR'] }] })).token;
  });
  afterAll(async () => {
    await app.close();
  });

  it('removes one person; their account and exam attempts stay', async () => {
    const s = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
    const quiz = await prisma.quiz.create({
      data: { organizationId: orgId, title: 'Q', status: 'PUBLISHED' },
    });
    await prisma.quizAttempt.create({
      data: {
        organizationId: orgId,
        quizId: quiz.id,
        userId: s.user.id,
        attemptNo: 1,
        status: 'GRADED',
        score: 1,
        percentage: 100,
      },
    });
    const id = await memberId(s.user.id);

    expect((await orgApi(app, instructor, orgId).delete(`/members/${id}`)).status).toBe(403);
    const r = await A().delete(`/members/${id}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ removed: 1, skipped: [] });
    expect(await prisma.organizationMember.count({ where: { id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: s.user.id } })).toBe(1);
    expect(await prisma.quizAttempt.count({ where: { userId: s.user.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'member.removed', entityId: id } })).toBe(
      1,
    );
    expect((await A().delete(`/members/${id}`)).status).toBe(404);
  });

  it('removes everyone deactivated at once, never yourself or the only admin', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const u = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
      ids.push(await memberId(u.user.id));
    }
    await prisma.organizationMember.updateMany({
      where: { id: { in: ids.slice(0, 2) } },
      data: { status: 'INACTIVE' },
    });

    const r = await A().post('/members/remove', { allDeactivated: true });
    expect(r.body).toEqual({ removed: 2, skipped: [] });
    expect(await prisma.organizationMember.count({ where: { id: ids[2] } })).toBe(1);

    const self = await memberId(admin.id);
    const r2 = await A().post('/members/remove', { ids: [self, ids[2]] });
    expect(r2.body.removed).toBe(1);
    expect(r2.body.skipped).toEqual([expect.objectContaining({ id: self })]);
    expect((await A().post('/members/remove', {})).status).toBe(422);
  });
});
