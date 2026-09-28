import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { EmailJob } from '@arc/types';
import { EMAIL_QUEUE } from './tokens';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@Inject(EMAIL_QUEUE) private readonly queue: Queue<EmailJob>) {}

  /** Queues an email for the worker. Returns false (and logs) if the queue is unavailable. */
  async send(job: EmailJob, name = 'email'): Promise<boolean> {
    try {
      await this.queue.add(name, job);
      return true;
    } catch (e) {
      this.logger.warn(`Could not queue email to ${job.to}: ${(e as Error).message}`);
      return false;
    }
  }
}
