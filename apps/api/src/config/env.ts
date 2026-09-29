import { z } from 'zod';

const boolish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  // Vercel sets VERCEL=1; don't set NODE_ENV there yourself (it would skip devDependencies at install).
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default(process.env.VERCEL ? 'production' : 'development'),
  PORT: z.coerce.number().int().default(4001),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  /** Optional. Without it (e.g. on Vercel) emails are sent directly instead of via the worker queue. */
  REDIS_URL: z.string().optional(),
  /** queue = Redis + worker, direct = SMTP from the API, log = print only. Auto-picked when unset. */
  EMAIL_DELIVERY: z.enum(['queue', 'direct', 'log']).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('ARC LABS <no-reply@arclabs.local>'),
  /**
   * Code runner for coding questions: arc (our own runner, apps/runner — free on Render),
   * judge0 (self-hosted or RapidAPI) or local (development only). Auto-picks arc when
   * CODE_RUNNER_URL is set.
   */
  CODE_RUNNER: z.enum(['arc', 'judge0', 'local']).optional(),
  CODE_RUNNER_URL: z.string().optional(),
  CODE_RUNNER_TOKEN: z.string().optional(),
  JUDGE0_URL: z.string().optional(),
  JUDGE0_AUTH_TOKEN: z.string().optional(),
  JUDGE0_RAPIDAPI_KEY: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default('arc-lms'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: boolish,
  SUPER_ADMIN_EMAIL: z.email().optional(),
});

export type Env = z.infer<typeof envSchema> & { EMAIL_DELIVERY: 'queue' | 'direct' | 'log' };

let cached: Env | undefined;

/** Parses and validates process.env once. Fails fast with a readable message. */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee apps/api/.env.example`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('FIREBASE_AUTH_EMULATOR_HOST must not be set in production');
  }
  const d = parsed.data;
  cached = {
    ...d,
    EMAIL_DELIVERY: d.EMAIL_DELIVERY ?? (d.REDIS_URL ? 'queue' : d.SMTP_HOST ? 'direct' : 'log'),
  };
  if (cached.EMAIL_DELIVERY === 'queue' && !cached.REDIS_URL) {
    throw new Error('EMAIL_DELIVERY=queue needs REDIS_URL');
  }
  if (cached.EMAIL_DELIVERY === 'direct' && !cached.SMTP_HOST) {
    throw new Error('EMAIL_DELIVERY=direct needs SMTP_HOST (and usually SMTP_USER / SMTP_PASS)');
  }
  return cached;
}
