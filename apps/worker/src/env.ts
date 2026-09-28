import 'dotenv/config';
import { z } from 'zod';

export const env = z
  .object({
    NODE_ENV: z.string().default('development'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('ARC LABS <no-reply@arclabs.local>'),
  })
  .parse(process.env);
