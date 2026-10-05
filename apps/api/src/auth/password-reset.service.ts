import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { passwordResetEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { FIREBASE_AUTH } from './firebase-admin.provider';

const ACTION = 'auth.password_reset_requested';
const PER_EMAIL_GAP_MS = 55_000; // one email a minute per address
const PER_EMAIL_HOUR = 5;
const PER_IP_HOUR = 30;

/**
 * Turns Firebase's action link (https://<project>.firebaseapp.com/__/auth/action?...oobCode=…)
 * into the ARC LABS page that handles it, so the email always opens our own site.
 */
export function ownActionLink(firebaseLink: string, webOrigin: string) {
  try {
    const u = new URL(firebaseLink);
    const code = u.searchParams.get('oobCode');
    if (!code) return firebaseLink;
    const mode = u.searchParams.get('mode') ?? 'resetPassword';
    return `${webOrigin}/reset-password?mode=${encodeURIComponent(mode)}&oobCode=${encodeURIComponent(code)}`;
  } catch {
    return firebaseLink;
  }
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get web() {
    return this.env.WEB_ORIGIN.split(',')[0]!.replace(/\/$/, '');
  }

  /**
   * Emails a reset link from MAIL_FROM (e.g. hello@arclabs.in). Never says whether the account
   * exists. `via: 'firebase'` = no mail server here, so the browser asks Firebase to send it.
   */
  async request(email: string, ip: string | undefined): Promise<{ via: 'email' | 'firebase' }> {
    if (this.env.EMAIL_DELIVERY === 'log') return { via: 'firebase' };

    const key = createHash('sha256').update(email).digest('hex').slice(0, 32);
    const hourAgo = new Date(Date.now() - 3_600_000);
    const [byEmail, byIp] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { action: ACTION, entityId: key, createdAt: { gt: hourAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      ip
        ? this.prisma.auditLog.count({
            where: { action: ACTION, ipAddress: ip, createdAt: { gt: hourAgo } },
          })
        : 0,
    ]);
    const tooSoon = byEmail[0] && Date.now() - byEmail[0].createdAt.getTime() < PER_EMAIL_GAP_MS;
    if (tooSoon || byEmail.length >= PER_EMAIL_HOUR || byIp >= PER_IP_HOUR) return { via: 'email' };
    await this.prisma.auditLog.create({
      data: { action: ACTION, entityType: 'user', entityId: key, ipAddress: ip ?? null },
    });

    let link: string;
    let name: string | null = null;
    try {
      const user = await this.auth.getUserByEmail(email);
      if (user.disabled) return { via: 'email' };
      name = user.displayName ?? null;
      link = ownActionLink(
        await this.auth.generatePasswordResetLink(email, {
          url: `${this.web}/login?email=${encodeURIComponent(email)}`,
        }),
        this.web,
      );
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/user-not-found' || code === 'auth/email-not-found')
        return { via: 'email' };
      this.logger.warn(`Reset link for ${email} failed: ${(e as Error).message}`);
      return { via: 'firebase' };
    }
    if (!name) {
      const u = await this.prisma.user.findUnique({ where: { email }, select: { fullName: true } });
      name = u?.fullName ?? null;
    }
    const sent = await this.mail.send(
      { to: email, ...passwordResetEmail({ name, link }) },
      'password-reset',
    );
    return { via: sent ? 'email' : 'firebase' };
  }
}
