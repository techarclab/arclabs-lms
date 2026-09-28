import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { requestId } from './common/request-id.middleware';
import type { Env } from './config/env';

/** Shared by main.ts and integration tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication, env: Env) {
  // Behind Vercel's proxy the client IP arrives in X-Forwarded-For (used for audit logs).
  const http = app.getHttpAdapter().getInstance() as { set?: (k: string, v: unknown) => void };
  http.set?.('trust proxy', process.env.VERCEL ? true : 'loopback');
  app.use(requestId);
  app.use(helmet());
  app.enableCors({ origin: env.WEB_ORIGIN.split(','), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
