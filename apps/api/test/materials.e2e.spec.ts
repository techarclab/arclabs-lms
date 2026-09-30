import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, orgApi, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Learning materials', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let otherOrgId: string;
  let ece: string;
  let cse: string;
  let staff: string;
  let viewer: string;
  let eceStudent: string;
  let cseStudent: string;
  let outsider: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
    orgId = (await prisma.organization.create({ data: { name: 'Mat College', slug: 'mat' } })).id;
    otherOrgId = (await prisma.organization.create({ data: { name: 'Other', slug: 'other' } })).id;
    ece = (await prisma.department.create({ data: { organizationId: orgId, name: 'ECE' } })).id;
    cse = (await prisma.department.create({ data: { organizationId: orgId, name: 'CSE' } })).id;
    staff = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['INSTRUCTOR'] }] })).token;
    viewer = (await makeUser(prisma, { memberOf: [{ orgId, roles: ['ORG_VIEWER'] }] })).token;
    const e = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
    const c = await makeUser(prisma, { memberOf: [{ orgId, roles: ['LEARNER'] }] });
    await prisma.organizationMember.updateMany({ where: { userId: e.user.id }, data: { departmentId: ece } });
    await prisma.organizationMember.updateMany({ where: { userId: c.user.id }, data: { departmentId: cse } });
    eceStudent = e.token;
    cseStudent = c.token;
    outsider = (await makeUser(prisma, { memberOf: [{ orgId: otherOrgId, roles: ['LEARNER'] }] }))
      .token;
  });
  afterAll(async () => {
    await app.close();
  });

  let subject: string;
  let unit: string;
  let pdfId: string;
  let videoId: string;

  it('faculty create subjects and units (two levels only)', async () => {
    const s = await orgApi(app, staff, orgId).post('/materials/folders', { name: 'Embedded Systems' });
    expect(s.status).toBe(201);
    subject = s.body.id;
    const u = await orgApi(app, staff, orgId).post('/materials/folders', {
      name: 'Unit 1',
      parentId: subject,
    });
    expect(u.status).toBe(201);
    unit = u.body.id;
    const deep = await orgApi(app, staff, orgId).post('/materials/folders', {
      name: 'Too deep',
      parentId: unit,
    });
    expect(deep.status).toBe(400);
  });

  it('shares a Drive PDF with ECE only and a YouTube video with everyone', async () => {
    const pdf = await orgApi(app, staff, orgId).post('/materials', {
      title: 'DHT11 datasheet',
      url: 'drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view?usp=sharing',
      folderId: unit,
      assignToAll: false,
      departmentIds: [ece],
    });
    expect(pdf.status).toBe(201);
    expect(pdf.body.link).toMatchObject({
      provider: 'google-drive',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQr',
    });
    expect(pdf.body.departments).toEqual([{ id: ece, name: 'ECE' }]);
    pdfId = pdf.body.id;

    const vid = await orgApi(app, staff, orgId).post('/materials', {
      title: 'Arduino basics',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      folderId: subject,
    });
    expect(vid.status).toBe(201);
    expect(vid.body.type).toBe('video');
    videoId = vid.body.id;

    const bad = await orgApi(app, staff, orgId).post('/materials', {
      title: 'No audience',
      url: 'https://example.com',
      assignToAll: false,
      departmentIds: [],
    });
    expect(bad.status).toBe(422);
  });

  it('students only see what is shared with their department', async () => {
    const e = await api(app, eceStudent).get('/my/materials');
    expect(e.status).toBe(200);
    expect(e.body.materials.map((m: { title: string }) => m.title).sort()).toEqual([
      'Arduino basics',
      'DHT11 datasheet',
    ]);
    expect(e.body.folders.map((f: { name: string }) => f.name).sort()).toEqual([
      'Embedded Systems',
      'Unit 1',
    ]);
    const c = await api(app, cseStudent).get('/my/materials');
    expect(c.body.materials.map((m: { title: string }) => m.title)).toEqual(['Arduino basics']);
    expect(c.body.folders.map((f: { name: string }) => f.name)).toEqual(['Embedded Systems']);
    const o = await api(app, outsider).get('/my/materials');
    expect(o.body.materials).toEqual([]);
    // CSE student can't open the ECE-only file
    expect((await api(app, cseStudent).post(`/my/materials/${pdfId}/open`, { action: 'view' })).status).toBe(404);
  });

  it('tracks views and downloads, and faculty see who opened it', async () => {
    const v = await api(app, eceStudent).post(`/my/materials/${pdfId}/open`, { action: 'view' });
    expect(v.status).toBe(200);
    expect(v.body.url).toContain('drive.google.com/file/d/');
    const d = await api(app, eceStudent).post(`/my/materials/${pdfId}/open`, { action: 'download' });
    expect(d.body.url).toContain('export=download');
    // videos have no download
    expect(
      (await api(app, eceStudent).post(`/my/materials/${videoId}/open`, { action: 'download' })).status,
    ).toBe(403);

    const lib = await orgApi(app, staff, orgId).get('/materials');
    const pdf = lib.body.materials.find((m: { id: string }) => m.id === pdfId);
    expect(pdf.stats).toEqual({ viewers: 1, views: 1, downloads: 1 });

    const act = await orgApi(app, staff, orgId).get(`/materials/${videoId}/activity`);
    expect(act.body.assigned).toBe(2);
    expect(act.body.notOpened).toHaveLength(2);
    const act2 = await orgApi(app, staff, orgId).get(`/materials/${pdfId}/activity`);
    expect(act2.body.assigned).toBe(1);
    expect(act2.body.opened[0]).toMatchObject({ department: 'ECE', views: 1, downloads: 1 });

    const mine = await api(app, eceStudent).get('/my/materials');
    expect(mine.body.materials.find((m: { id: string }) => m.id === pdfId)).toMatchObject({
      viewed: true,
      downloaded: true,
    });
  });

  it('hidden, view-only and moved materials behave', async () => {
    await orgApi(app, staff, orgId).patch(`/materials/${pdfId}`, { allowDownload: false });
    const m = (await api(app, eceStudent).get('/my/materials')).body.materials.find(
      (x: { id: string }) => x.id === pdfId,
    );
    expect(m.link.downloadUrl).toBeNull();
    expect(
      (await api(app, eceStudent).post(`/my/materials/${pdfId}/open`, { action: 'download' })).status,
    ).toBe(403);

    await orgApi(app, staff, orgId).patch(`/materials/${pdfId}`, { published: false });
    expect((await api(app, eceStudent).get('/my/materials')).body.materials).toHaveLength(1);

    // Share with everyone → CSE sees it once published again
    const upd = await orgApi(app, staff, orgId).patch(`/materials/${pdfId}`, {
      published: true,
      assignToAll: true,
    });
    expect(upd.body.departments).toEqual([]);
    expect((await api(app, cseStudent).get('/my/materials')).body.materials).toHaveLength(2);

    // Deleting the subject keeps the materials (now not in a folder)
    expect((await orgApi(app, staff, orgId).delete(`/materials/folders/${subject}`)).status).toBe(204);
    const lib = await orgApi(app, staff, orgId).get('/materials');
    expect(lib.body.folders).toEqual([]);
    expect(lib.body.materials.every((x: { folderId: string | null }) => x.folderId === null)).toBe(true);
  });

  it('students and read-only viewers cannot manage materials; orgs are isolated', async () => {
    expect((await orgApi(app, eceStudent, orgId).get('/materials')).status).toBe(403);
    expect((await orgApi(app, viewer, orgId).post('/materials', { title: 'x', url: 'https://a.com' })).status).toBe(403);
    const other = await makeUser(prisma, { memberOf: [{ orgId: otherOrgId, roles: ['ORG_ADMIN'] }] });
    expect((await orgApi(app, other.token, otherOrgId).patch(`/materials/${pdfId}`, { title: 'Hacked' })).status).toBe(404);
    expect((await orgApi(app, other.token, otherOrgId).post('/materials', {
      title: 'Wrong dept', url: 'https://a.com', assignToAll: false, departmentIds: [ece],
    })).status).toBe(400);
  });

  it('check-link explains what students will get', async () => {
    const r = await orgApi(app, staff, orgId).post('/materials/check-link', {
      url: 'https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQr/edit',
    });
    expect(r.body).toMatchObject({ valid: true, link: { provider: 'google-docs', type: 'slides' } });
    expect((await orgApi(app, staff, orgId).post('/materials/check-link', { url: 'not a link' })).body).toEqual({ valid: false });
  });
});
