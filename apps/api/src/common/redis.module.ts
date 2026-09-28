import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export const REDIS = Symbol('REDIS');

/** Optional Redis client: null when REDIS_URL is not configured (e.g. on Vercel). */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.REDIS_URL
          ? new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
          : null,
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis | null) {}
  onModuleDestroy() {
    this.redis?.disconnect();
  }
}
