import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUES } from '@arc/types';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { MailService } from './mail.service';

import { EMAIL_QUEUE } from './tokens';

export { EMAIL_QUEUE };

/**
 * Producer side of the background job queues (the worker app consumes them).
 * The queue exists only when EMAIL_DELIVERY=queue; otherwise MailService sends directly or logs.
 */
@Global()
@Module({
  providers: [
    {
      provide: EMAIL_QUEUE,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.EMAIL_DELIVERY === 'queue' && env.REDIS_URL
          ? new Queue(QUEUES.email, {
              connection: new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }),
              defaultJobOptions: {
                attempts: 5,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: 1000,
                removeOnFail: 5000,
              },
            })
          : null,
    },
    MailService,
  ],
  exports: [EMAIL_QUEUE, MailService],
})
export class QueueModule implements OnModuleDestroy {
  constructor(@Inject(EMAIL_QUEUE) private readonly queue: Queue | null) {}
  async onModuleDestroy() {
    await this.queue?.close();
  }
}
