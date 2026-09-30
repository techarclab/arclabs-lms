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
import { CODE_RUNNER_IMPL, type CodeRunnerImpl } from '../src/exams/code-runner';
import { AiGrader, AiGraderUnavailableError, type AiGradeInput } from '../src/exams/ai-grader';
import { MATERIAL_FILES, type MaterialFiles } from '../src/materials/file-storage';

/** In-memory stand-in for Firebase Storage. Call `fakeFiles.put(path)` to "upload" a file. */
export const fakeFiles = {
  configured: true,
  objects: new Map<string, { size: number; contentType: string }>(),
  removed: [] as string[],
  put(path: string, size = 1234, contentType = 'application/pdf') {
    this.objects.set(path, { size, contentType });
  },
};
const fakeFilesImpl: MaterialFiles = {
  get configured() {
    return fakeFiles.configured;
  },
  uploadUrl: async (path) => `https://storage.test/upload/${path}`,
  readUrl: async (path, o) => `https://storage.test/${path}?${o.download ? 'download' : 'view'}`,
  stat: async (path) => fakeFiles.objects.get(path) ?? null,
  remove: async (path) => {
    fakeFiles.removed.push(path);
    fakeFiles.objects.delete(path);
  },
};

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

/** In-memory stand-in for firebase-admin Auth. Bearer tokens are simply the uid ("uid-…"). */
export const fakeFirebaseUsers = new Map<string, { uid: string; email: string }>();
const fakeFirebaseAuth = {
  verifyIdToken: async (token: string) => {
    if (!token.startsWith('uid-')) throw new Error('invalid token');
    const known = [...fakeFirebaseUsers.values()].find((u) => u.uid === token);
    return { uid: token, email: known?.email ?? `${token}@test.local`, email_verified: true };
  },
  getUserByEmail: async (email: string) => {
    const u = fakeFirebaseUsers.get(email);
    if (!u) throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
    return u;
  },
  createUser: async ({ email }: { email: string }) => {
    const u = { uid: `uid-fb-${fakeFirebaseUsers.size + 1}-${Date.now()}`, email };
    fakeFirebaseUsers.set(email, u);
    return u;
  },
  generatePasswordResetLink: async (email: string) =>
    `http://test.local/reset?email=${encodeURIComponent(email)}`,
};

/**
 * Stand-in code runner. "Programs" are keywords: REVERSE prints the input reversed, ECHO prints it
 * back, COMPILE_ERR fails to compile, LOOP times out. Set `fakeRunner.down` to simulate an outage.
 */
export const fakeRunner = { down: false, runs: 0 };
const fakeRunnerImpl: CodeRunnerImpl = {
  provider: 'local',
  async run(_lang, code, stdin) {
    fakeRunner.runs++;
    if (fakeRunner.down) throw new Error('runner offline');
    if (code.includes('COMPILE_ERR'))
      return { status: 'COMPILE_ERROR', stdout: '', error: 'main.c:1: error', timeMs: null };
    if (code.includes('LOOP'))
      return { status: 'TIME_LIMIT', stdout: '', error: null, timeMs: 2000 };
    const text = stdin.replace(/\n$/, '');
    if (code.includes('REVERSE'))
      return { status: 'OK', stdout: [...text].reverse().join('') + '\n', error: null, timeMs: 5 };
    if (code.includes('ECHO')) return { status: 'OK', stdout: stdin, error: null, timeMs: 5 };
    return { status: 'OK', stdout: '', error: null, timeMs: 5 };
  },
};

/**
 * Stand-in AI marker. Code containing FULL gets every rubric mark, HALF gets half of each item,
 * anything else gets 0. Set `fakeAi.down` to simulate the AI service being unavailable.
 */
export const fakeAi = { down: false, calls: 0 };
const fakeAiGrader = {
  get configured() {
    return true;
  },
  /** Question import: returns one question read "by AI" (or fails when fakeAi.down). */
  async ask<T>(_s: string, user: string, _d: number, _m: number, read: (t: string) => T | null) {
    fakeAi.calls++;
    if (fakeAi.down) throw new AiGraderUnavailableError('AI offline');
    const prompt = /TEXT:\n<<<\n\s*\d+[.)]\s*([^\n]+)/.exec(user)?.[1] ?? 'AI question';
    const out = read(
      JSON.stringify({
        questions: [
          {
            type: 'SINGLE_CHOICE',
            prompt,
            options: [
              { text: 'Yes', correct: true },
              { text: 'No', correct: false },
            ],
            difficulty: 'EASY',
            topic: 'Fake topic',
          },
        ],
      }),
    );
    if (out === null) throw new AiGraderUnavailableError('unreadable');
    return out;
  },
  async grade(input: AiGradeInput) {
    fakeAi.calls++;
    if (fakeAi.down) throw new AiGraderUnavailableError('AI offline');
    const f = input.code.includes('FULL') ? 1 : input.code.includes('HALF') ? 0.5 : 0;
    const criteria = input.rubric.map((r) => ({
      text: r.text,
      points: r.points,
      awarded: r.points * f,
      comment: f ? 'ok' : 'missing',
    }));
    const max = input.rubric.reduce((s, r) => s + r.points, 0);
    const sum = criteria.reduce((s, c) => s + c.awarded, 0);
    const penaltyPct = input.compiled ? 0 : input.penaltyPct;
    return {
      compiled: input.compiled,
      compileError: input.compileError,
      criteria,
      awarded: Math.round(sum * (1 - penaltyPct / 100) * 100) / 100,
      max,
      penaltyPct,
      feedback: 'fake feedback',
      model: 'fake',
    };
  },
};

export async function createTestApp() {
  applyTestEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FIREBASE_AUTH)
    .useValue(fakeFirebaseAuth)
    .overrideProvider(CODE_RUNNER_IMPL)
    .useValue(fakeRunnerImpl)
    .overrideProvider(AiGrader)
    .useValue(fakeAiGrader)
    .overrideProvider(MATERIAL_FILES)
    .useValue(fakeFilesImpl)
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
    put: (url: string, body?: object) => withAuth(agent.put(`/api/v1${url}`)).send(body ?? {}),
    delete: (url: string) => withAuth(agent.delete(`/api/v1${url}`)),
  };
}

/** Same as api() but sends X-Org-Id on every request. */
export function orgApi(app: INestApplication, token: string, orgId: string) {
  const a = api(app, token);
  return {
    get: (url: string) => a.get(url).set('X-Org-Id', orgId),
    post: (url: string, body?: object) => a.post(url, body).set('X-Org-Id', orgId),
    patch: (url: string, body?: object) => a.patch(url, body).set('X-Org-Id', orgId),
    put: (url: string, body?: object) => a.put(url, body).set('X-Org-Id', orgId),
    delete: (url: string) => a.delete(url).set('X-Org-Id', orgId),
  };
}
