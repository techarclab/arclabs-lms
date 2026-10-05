import type { INestApplication } from '@nestjs/common';
import { createTestApp, fakeFirebaseUsers, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Admins fix a wrong email', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let otherOrg: string;
  let admin: string;
  const A = () => orgApi(app, admin, orgId);
  const memberOf = async (userId: string) =>
    (await prisma.organizationMember.findFirstOrThrow({ where: { organizationId: orgId, userId } }))
      .id;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgId = (
      await prisma.organization.create({
        data: { name: 'E College', slug: 'e', collegeEmailDomains: ['ecollege.edu'] },
      })
    ).id;
    otherOrg = (await prisma.organization.create({ data: { name: 'Other', slug: 'o' } })).id;
    admin = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_ADMIN'] }] })).token;
  });
  afterAll(async () => {
    await app.close();
  });

  it('changes the sign-in email (also in Firebase), the name and the college email', async () => {
    const s = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
    fakeFirebaseUsers.set(s.user.email, { uid: s.user.firebaseUid, email: s.user.email });
    const id = await memberOf(s.user.id);

    const r = await A().patch(`/members/${id}`, {
      email: '  Ravi.Kumar@Gmail.com ',
      fullName: 'Ravi Kumar',
      collegeEmail: '21ec001@ecollege.edu',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      email: 'ravi.kumar@gmail.com',
      fullName: 'Ravi Kumar',
      collegeEmail: '21ec001@ecollege.edu',
    });
    expect(fakeFirebaseUsers.get('ravi.kumar@gmail.com')?.uid).toBe(s.user.firebaseUid);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: id, action: 'member.updated' },
    });
    expect(log.meta).toMatchObject({
      emailBefore: s.user.email,
      emailAfter: 'ravi.kumar@gmail.com',
    });

    // college email must be on the college domain; null clears it
    expect((await A().patch(`/members/${id}`, { collegeEmail: 'x@gmail.com' })).status).toBe(400);
    expect(
      (await A().patch(`/members/${id}`, { collegeEmail: null })).body.collegeEmail,
    ).toBeNull();
    expect((await A().patch(`/members/${id}`, { email: 'not-an-email' })).status).toBe(422);
  });

  it('refuses an email someone else uses, and shared accounts', async () => {
    const a = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
    const b = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
    const r = await A().patch(`/members/${await memberOf(a.user.id)}`, { email: b.user.email });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('EMAIL_TAKEN');

    const shared = await makeUser(prisma, {
      memberOf: [
        { orgId, roles: ['LEARNER'] },
        { orgId: otherOrg, roles: ['LEARNER'] },
      ],
    });
    const r2 = await A().patch(`/members/${await memberOf(shared.user.id)}`, {
      email: 'new@x.com',
    });
    expect(r2.status).toBe(403);
    expect(r2.body.error.code).toBe('SHARED_ACCOUNT');
  });
});
