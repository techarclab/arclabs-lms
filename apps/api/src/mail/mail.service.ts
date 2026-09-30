import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailJob } from '@arc/types';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { EMAIL_QUEUE } from './tokens';

/**
 * Sends transactional email in one of three modes (EMAIL_DELIVERY):
 * - queue: hands the job to the worker via Redis/BullMQ (local dev, long-running servers)
 * - direct: sends over SMTP from the API process (Vercel / serverless)
 * - log: prints the email instead of sending (no mail server configured)
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport?: Transporter;

  constructor(
    @Inject(EMAIL_QUEUE) private readonly queue: Queue<EmailJob> | null,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Returns false (and logs) if the email could not be handed off; callers show the link instead. */
  async send(job: EmailJob, name = 'email'): Promise<boolean> {
    try {
      switch (this.env.EMAIL_DELIVERY) {
        case 'queue':
          if (!this.queue) return false;
          await this.queue.add(name, job);
          return true;
        case 'direct':
          await this.smtp().sendMail({
            from: this.env.MAIL_FROM,
            to: job.to,
            bcc: job.bcc,
            replyTo: job.replyTo,
            subject: job.subject,
            text: job.text,
            html: job.html,
          });
          return true;
        default:
          this.logger.log(`[email not sent: no mail server] to=${job.to} subject="${job.subject}"`);
          return false;
      }
    } catch (e) {
      this.logger.warn(`Could not send email to ${job.to}: ${(e as Error).message}`);
      return false;
    }
  }

  private smtp() {
    this.transport ??= nodemailer.createTransport({
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT,
      secure: this.env.SMTP_PORT === 465,
      auth: this.env.SMTP_USER ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS } : undefined,
    });
    return this.transport;
  }
}
