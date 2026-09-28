import type { Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { env } from '../env';
import type { EmailJob } from '../queues';

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

export async function sendEmail(job: Job<EmailJob>) {
  const { to, subject, text, html } = job.data;
  const info = await transport.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
  return { messageId: info.messageId };
}
