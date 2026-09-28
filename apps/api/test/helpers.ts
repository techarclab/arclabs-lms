import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { FIREBASE_AUTH } from '../src/auth/firebase-admin.provider';
import { loadEnv } from '../src/config/env';
import type { OrgRole } from '@arc/types';
import { PrismaService } from '../src/prisma/prisma.service';

/** Test env: real Postgres (test DB) + Redis, fake Firebase. */
export function applyTestEnv() {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ??
      'postgresql://arc:arc_dev_password@localhost:5432/arc_lms_test?schema=public',
    FIREBASE_PROJECT_ID: 'demo-test',
    S3_BUCKET: 'test',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
  });
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
}

/** Bearer token format understood by the fake: "<uid>". */
const fakeFirebaseAuth = {
  verifyIdToken: async (token: string) => {
    if (!token.startsWith('uid-')) throw new Error('invalid token');
    return { uid: token, email: `${token}@test.local`, email_verified: true };
  },
};

export async function createTestApp() {
  applyTestEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FIREBASE_AUTH)
    .useValue(fakeFirebaseAuth)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, loadEnv());
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}

export async function resetDb(prisma: PrismaService) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let n = 0;
export async function makeUser(
  prisma: PrismaService,
  opts: { superAdmin?: boolean; memberOf?: { orgId: string; roles: OrgRole[] }[] } = {},
) {
  const uid = `uid-${Date.now()}-${n++}`;
  const user = await prisma.user.create({
    data: {
      firebaseUid: uid,
      email: `${uid}@test.local`,
      fullName: `User ${n}`,
      isSuperAdmin: opts.superAdmin ?? false,
      memberships: {
        create: (opts.memberOf ?? []).map((m) => ({ organizationId: m.orgId, roles: m.roles })),
      },
    },
  });
  return { user, token: uid };
}

export function api(app: INestApplication, token?: string) {
  const agent = request(app.getHttpServer());
  const withAuth = (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
  return {
    get: (url: string) => withAuth(agent.get(`/api/v1${url}`)),
    post: (url: string, body?: object) => withAuth(agent.post(`/api/v1${url}`)).send(body ?? {}),
    patch: (url: string, body?: object) => withAuth(agent.patch(`/api/v1${url}`)).send(body ?? {}),
  };
}
