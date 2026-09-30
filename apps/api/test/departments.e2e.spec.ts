import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, fakeFirebaseUsers, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';

describe('Departments: own registration links, pages and department-only faculty', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let ece: string;
  let cse: string;
  let admin: string;
  let eceFaculty: { id: string; token: string };
  let eceStudent: { id: string; token: string };
  let cseStudent: { id: string; token: string };
  let eceCode: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    app.get(MailService).send = async () => true;
    orgId = (
      await prisma.organization.create({
        data: { name: 'Dept College', slug: 'deptcol', joinCode: 'DEPTCOL-AAAA', joinEnabled: true },
      })
    ).id;
    ece = (await prisma.department.create({ data: { organizationId: orgId, name: 'ECE' } })).id;
    cse = (await prisma.department.create({ data: { organizationId: orgId, name: 'CSE' } })).id;
    admin = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_ADMIN'] }] })).token;
    const f = await makeUser(prisma, { memberOf: [{ orgId, roles: ['INSTRUCTOR'] }] });
    await prisma.organizationMember.updateMany({ where: { userId: f.user.id }, data: { departmentId: ece } });
    eceFaculty = { id: f.user.id, token: f.token };
    const e = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
    await prisma.organizationMember.updateMany({ where: { userId: e.user.id }, data: { departmentId: ece } });
    eceStudent = { id: e.user.id, token: e.token };
    const c = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
    await prisma.organizationMember.updateMany({ where: { userId: c.user.id }, data: { departmentId: cse } });
    cseStudent = { id: c.user.id, token: c.token };
  });
  afterAll(async () => {
    await app.close();
  });

  it('each department gets its own registration link that puts students in that department', async () => {
    const r = await orgApi(app, admin, orgId).post(`/departments/${ece}/join-link`, { enabled: true });
    expect(r.status).toBe(200);
    expect(r.body.joinCode).toMatch(/^DEPTCO-ECE-[A-Z2-9]{4}$/);
    eceCode = r.body.joinCode;
    const info = await api(app).get(`/join/${eceCode.toLowerCase()}`);
    expect(info.body).toMatchObject({ department: { id: ece, name: 'ECE' } });

    const uid = 'uid-dept-student';
    fakeFirebaseUsers.set('new@deptcol.edu', { uid, email: 'new@deptcol.edu' });
    // department comes from the link, even if the body says CSE
    const j = await api(app, uid).post(`/join/${eceCode}`, {
      fullName: 'New Student',
      externalId: '22ECE77',
      departmentId: cse,
      collegeEmail: 'new@deptcol.edu',
    });
    expect(j.status).toBe(200);
    const m = await prisma.organizationMember.findFirst({ where: { user: { firebaseUid: uid } } });
    expect(m?.departmentId).toBe(ece);

    // the college-wide link still works (with the dropdown); closing the ECE link stops it
    expect((await api(app).get('/join/DEPTCOL-AAAA')).body.department).toBeNull();
    await orgApi(app, admin, orgId).post(`/departments/${ece}/join-link`, { enabled: false });
    expect((await api(app).get(`/join/${eceCode}`)).status).toBe(404);
    const regen = await orgApi(app, admin, orgId).post(`/departments/${ece}/join-link/regenerate`);
    expect(regen.body.joinCode).not.toBe(eceCode);
    expect(regen.body.joinEnabled).toBe(true);
    // on the college link a department must be chosen
    const uid2 = 'uid-dept-student2';
    fakeFirebaseUsers.set('two@deptcol.edu', { uid: uid2, email: 'two@deptcol.edu' });
    const noDept = await api(app, uid2).post('/join/DEPTCOL-AAAA', {
      fullName: 'Two',
      externalId: 'X2',
      collegeEmail: 'two@deptcol.edu',
    });
    expect(noDept.status).toBe(400);
  });

  it('department page: details and students; faculty only see their own department', async () => {
    const d = await orgApi(app, admin, orgId).get(`/departments/${ece}`);
    expect(d.body).toMatchObject({ name: 'ECE', learnerCount: 2, staffCount: 1 });
    expect(d.body.staff[0].userId).toBe(eceFaculty.id);
    const st = await orgApi(app, admin, orgId).get(`/departments/${ece}/students`);
    expect(st.body.map((s: { externalId: string }) => s.externalId)).toContain('22ECE77');

    const fac = orgApi(app, eceFaculty.token, orgId);
    expect((await fac.get('/departments')).body.map((x: { name: string }) => x.name)).toEqual(['ECE']);
    expect((await fac.get(`/departments/${cse}`)).status).toBe(404);
    expect((await fac.post(`/departments/${cse}/join-link`, { enabled: true })).status).toBe(403);
  });

  it('department faculty create exams for their department and see only its students', async () => {
    const fac = orgApi(app, eceFaculty.token, orgId);
    const ex = await fac.post('/exams', { title: 'ECE quiz' });
    expect(ex.status).toBe(201);
    expect(ex.body.audience).toMatchObject({ assignToAll: false, departments: [{ id: ece }] });
    // can't widen to the whole college or another department
    expect(
      (await fac.put(`/exams/${ex.body.id}/audience`, { assignToAll: true, departmentIds: [] })).status,
    ).toBe(403);
    expect(
      (await fac.put(`/exams/${ex.body.id}/audience`, { assignToAll: false, departmentIds: [cse] }))
        .status,
    ).toBe(403);

    // admin's college-wide exam: visible (read) but not editable; a CSE-only exam is hidden
    const all = await orgApi(app, admin, orgId).post('/exams', { title: 'College exam' });
    await orgApi(app, admin, orgId).put(`/exams/${all.body.id}/audience`, {
      assignToAll: true,
      departmentIds: [],
    });
    const cseExam = await orgApi(app, admin, orgId).post('/exams', { title: 'CSE only' });
    await orgApi(app, admin, orgId).put(`/exams/${cseExam.body.id}/audience`, {
      assignToAll: false,
      departmentIds: [cse],
    });
    const titles = (await fac.get('/exams')).body.data.map((e: { title: string }) => e.title);
    expect(titles).toEqual(expect.arrayContaining(['ECE quiz', 'College exam']));
    expect(titles).not.toContain('CSE only');
    expect((await fac.get(`/exams/${cseExam.body.id}`)).status).toBe(404);
    expect((await fac.patch(`/exams/${all.body.id}`, { title: 'Hijack' })).status).toBe(403);

    // results of the college-wide exam list only ECE students
    const an = await fac.get(`/exams/${all.body.id}/analytics`);
    expect(an.status).toBe(200);
    const ids = an.body.candidates.map((c: { userId: string }) => c.userId);
    expect(ids).toContain(eceStudent.id);
    expect(ids).not.toContain(cseStudent.id);

    // admin can filter the exam list by department
    const cseList = await orgApi(app, admin, orgId).get(`/exams?departmentId=${cse}`);
    expect(cseList.body.data.map((e: { title: string }) => e.title).sort()).toEqual([
      'CSE only',
      'College exam',
    ]);
  });

  it('materials, lab marks and announcements stay inside the department', async () => {
    const fac = orgApi(app, eceFaculty.token, orgId);
    expect(
      (await fac.post('/materials', { title: 'For all', url: 'https://a.com' })).status,
    ).toBe(403); // default is all students
    const mat = await fac.post('/materials', {
      title: 'ECE notes',
      url: 'https://a.com/n.pdf',
      assignToAll: false,
      departmentIds: [ece],
    });
    expect(mat.status).toBe(201);
    const adminMat = await orgApi(app, admin, orgId).post('/materials', {
      title: 'CSE notes',
      url: 'https://a.com/c.pdf',
      assignToAll: false,
      departmentIds: [cse],
    });
    const lib = await fac.get('/materials');
    expect(lib.body.materials.map((m: { title: string }) => m.title)).toEqual(['ECE notes']);
    expect((await fac.delete(`/materials/${adminMat.body.id}`)).status).toBe(404);

    const lab = await fac.post('/labs', {
      title: 'ECE lab',
      criteria: [{ id: 'p', text: 'Presentation', max: 5 }],
      assignToAll: false,
      departmentIds: [ece],
    });
    expect(lab.status).toBe(201);
    const collegeLab = await orgApi(app, admin, orgId).post('/labs', {
      title: 'All lab',
      criteria: [{ id: 'p', text: 'Presentation', max: 5 }],
    });
    const sheet = await fac.get(`/labs/${collegeLab.body.id}`);
    expect(sheet.body.rows.every((r: { department: string }) => r.department === 'ECE')).toBe(true);
    expect(
      (await fac.put(`/labs/${collegeLab.body.id}/marks`, {
        marks: [{ userId: cseStudent.id, scores: { p: 3 } }],
      })).status,
    ).toBe(400);
    expect(
      (await fac.put(`/labs/${collegeLab.body.id}/marks`, {
        marks: [{ userId: eceStudent.id, scores: { p: 3 } }],
      })).status,
    ).toBe(200);

    expect(
      (await fac.post('/announcements/preview', { audience: { type: 'all' } })).status,
    ).toBe(403);
    const pre = await fac.post('/announcements/preview', {
      audience: { type: 'departments', departmentIds: [ece] },
    });
    expect(pre.body.recipients).toBe(2);
    const sent = await fac.post('/announcements', {
      subject: 'ECE lab tomorrow',
      body: 'Bring your kits.',
      audience: { type: 'departments', departmentIds: [ece] },
    });
    expect(sent.status).toBe(201);
    expect((await api(app, cseStudent.token).get('/my/announcements')).body).toEqual([]);
  });

  it('college admins are never limited, even with a department set', async () => {
    const a2 = await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_ADMIN'] }] });
    await prisma.organizationMember.updateMany({ where: { userId: a2.user.id }, data: { departmentId: ece } });
    const list = await orgApi(app, a2.token, orgId).get('/departments');
    expect(list.body).toHaveLength(2);
    const me = await api(app, eceFaculty.token).get('/auth/me');
    expect(me.body.memberships[0]).toMatchObject({
      scopedDepartmentId: ece,
      department: { id: ece, name: 'ECE' },
    });
  });
});
