import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadEnv } from './config/env';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let ready: Promise<Handler> | undefined;

// The Express adapter is passed explicitly so the bundler includes it (Nest otherwise loads it
// dynamically by name, which a bundle can't resolve).

/** Boots Nest once per function instance and reuses it for every request (Vercel Functions). */
async function bootstrap(): Promise<Handler> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    logger: ['error', 'warn'],
  });
  configureApp(app, env);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= bootstrap().catch((e) => {
    ready = undefined; // retry on the next request instead of caching the failure
    throw e;
  });
  const app = await ready;
  app(req, res);
}
