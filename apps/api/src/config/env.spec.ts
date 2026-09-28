import { afterEach, describe, expect, it, vi } from 'vitest';

const base = { DATABASE_URL: 'postgresql://x', FIREBASE_PROJECT_ID: 'p' };
const saved = { ...process.env };

async function load(vars: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...base, ...vars } as NodeJS.ProcessEnv;
  const { loadEnv } = await import('./env');
  return loadEnv;
}

afterEach(() => {
  process.env = { ...saved };
});

describe('loadEnv email delivery', () => {
  it('uses the queue when Redis is configured', async () => {
    expect((await load({ REDIS_URL: 'redis://r' }))().EMAIL_DELIVERY).toBe('queue');
  });
  it('sends directly on serverless when only SMTP is configured', async () => {
    expect((await load({ SMTP_HOST: 'smtp.x' }))().EMAIL_DELIVERY).toBe('direct');
  });
  it('falls back to logging with neither', async () => {
    const env = (await load({}))();
    expect(env.EMAIL_DELIVERY).toBe('log');
    expect(env.S3_BUCKET).toBe('arc-lms');
  });
  it('rejects queue mode without Redis', async () => {
    expect(await load({ EMAIL_DELIVERY: 'queue' })).toThrow(/REDIS_URL/);
  });
});
