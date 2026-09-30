import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Lab marks (offline labs / project reviews)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let ece: string;
  let cse: string;
  let staff: string;
  let viewer: string;
  const students: { id: string; token: string }[] = [];
  let cseStudent: { id: string; token: string };
  let labId: string;

  const criteria = [
    { id: 'pres', text: 'Presentation', max: 5 },
    { id: 'contrib', text: 'Contribution in project', max: 5 },
    { id: 'viva', text: 'Viva', max: 10 },
  ];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgId = (await prisma.organization.create({ data: { name: 'Lab College', slug: 'lab' } })).id;
    ece = (await prisma.department.create({ data: { organizationId: orgId, name: 'ECE' } })).id;
    cse = (await prisma.department.create({ data: { organizationId: orgId, name: 'CSE' } })).id;
    staff = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['INSTRUCTOR'] }] })).token;
    viewer = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_VIEWER'] }] })).token;
    for (let i = 0; i < 3; i++) {
      const s = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
      await prisma.organizationMember.updateMany({
        where: { userId: s.user.id },
        data: { departmentId: ece, externalId: `22ECE0${i + 1}` },
      });
      students.push({ id: s.user.id, token: s.token });
    }
    const c = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
    await prisma.organizationMember.updateMany({
      where: { userId: c.user.id },
      data: { departmentId: cse },
    });
    cseStudent = { id: c.user.id, token: c.token };
  });
  afterAll(async () => {
    await app.close();
  });

  it('faculty create a lab with criteria for ECE only', async () => {
    const r = await orgApi(app, staff, orgId).post('/labs', {
      title: 'IoT mini project review',
      heldOn: '2026-10-01T10:00:00.000Z',
      criteria,
      assignToAll: false,
      departmentIds: [ece],
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ maxTotal: 20, stats: { students: 3, marked: 0 } });
    labId = r.body.id;
    expect(
      (await orgApi(app, staff, orgId).post('/labs', { title: 'No criteria', criteria: [] }))
        .status,
    ).toBe(422);
  });

  it('the mark sheet lists the ECE students; marks save, total and average are calculated', async () => {
    const sheet = await orgApi(app, staff, orgId).get(`/labs/${labId}`);
    expect(sheet.body.rows.map((r: { externalId: string }) => r.externalId)).toEqual([
      '22ECE01',
      '22ECE02',
      '22ECE03',
    ]);
    const [a, b, c] = students;
    const save = await orgApi(app, staff, orgId).put(`/labs/${labId}/marks`, {
      marks: [
        { userId: a!.id, scores: { pres: 4, contrib: 5, viva: 8 }, remarks: 'Great demo' },
        { userId: b!.id, scores: { pres: 3, contrib: 2.5, viva: null } },
        { userId: c!.id, scores: {}, absent: true },
      ],
    });
    expect(save.status).toBe(200);
    expect(save.body.stats).toMatchObject({
      students: 3,
      marked: 2,
      absent: 1,
      average: 11.25,
      highest: 17,
      lowest: 5.5,
      criteriaAverage: { pres: 3.5, contrib: 3.75, viva: 8 },
    });
    const after = await orgApi(app, staff, orgId).get(`/labs/${labId}`);
    expect(after.body.rows[0]).toMatchObject({ total: 17, remarks: 'Great demo' });
    expect(after.body.rows[2]).toMatchObject({ absent: true, total: null });
  });

  it('rejects marks above the maximum, unknown criteria and students not in the lab', async () => {
    const bad = (body: object) => orgApi(app, staff, orgId).put(`/labs/${labId}/marks`, body);
    expect((await bad({ marks: [{ userId: students[0]!.id, scores: { pres: 6 } }] })).status).toBe(
      400,
    );
    expect((await bad({ marks: [{ userId: students[0]!.id, scores: { nope: 1 } }] })).status).toBe(
      400,
    );
    expect((await bad({ marks: [{ userId: cseStudent.id, scores: { pres: 1 } }] })).status).toBe(
      400,
    );
    expect((await bad({ marks: [{ userId: students[0]!.id, scores: { pres: -1 } }] })).status).toBe(
      422,
    );
  });

  it('students see their marks instantly, with the class average', async () => {
    const mine = await api(app, students[0]!.token).get('/my/labs');
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({
      title: 'IoT mini project review',
      total: 17,
      maxTotal: 20,
      scores: { pres: 4, contrib: 5, viva: 8 },
      classAverage: 11.25,
      highest: 17,
      remarks: 'Great demo',
    });
    expect((await api(app, cseStudent.token).get('/my/labs')).body).toEqual([]);
  });

  it('changing criteria recalculates totals; list shows stats; CSV exports', async () => {
    const up = await orgApi(app, staff, orgId).patch(`/labs/${labId}`, {
      criteria: criteria.filter((c) => c.id !== 'viva'),
    });
    expect(up.status).toBe(200);
    expect(up.body.maxTotal).toBe(10);
    expect(up.body.rows[0].total).toBe(9);
    const list = await orgApi(app, staff, orgId).get('/labs');
    expect(list.body[0]).toMatchObject({ id: labId, stats: { marked: 2, average: 7.25 } });
    const csv = await orgApi(app, staff, orgId).get(`/labs/${labId}/marks.csv`);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('Presentation (/5)');
    expect(csv.text).toContain('Class average');
    expect(csv.text).toContain('Absent');
  });

  it('read-only viewers can see but not change; students cannot manage', async () => {
    expect((await orgApi(app, viewer, orgId).get(`/labs/${labId}`)).status).toBe(200);
    expect(
      (
        await orgApi(app, viewer, orgId).put(`/labs/${labId}/marks`, {
          marks: [{ userId: students[0]!.id, scores: { pres: 1 } }],
        })
      ).status,
    ).toBe(403);
    expect((await orgApi(app, students[0]!.token, orgId).get('/labs')).status).toBe(403);
    expect((await orgApi(app, staff, orgId).delete(`/labs/${labId}`)).status).toBe(204);
    expect((await api(app, students[0]!.token).get('/my/labs')).body).toEqual([]);
  });
});
