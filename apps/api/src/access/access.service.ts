import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AccessCodeGenerated,
  AccessCodeStatus,
  AccessLoginResponse,
  MeResponse,
} from '@arc/types';
import { normalizeAccessCode } from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { accessCodeEmail } from '../mail/templates';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Bearer tokens issued to access-code sessions start with this, so the auth guard can tell them apart. */
export const ACCESS_TOKEN_PREFIX = 'acc_';
const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
/** Don't write lastSeenAt/expiresAt on every request — once every 10 minutes is enough. */
const TOUCH_EVERY_MS = 10 * 60 * 1000;

// No 0/O/1/I/L — easy to read from a message and type.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUPS = 5;
const GROUP_LEN = 4;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Same user id for every access-code session: it never matches a real user. */
export const ACCESS_USER_ID = '00000000-0000-0000-0000-000000000000';

export interface AccessSessionInfo {
  sessionId: string;
  organizationId: string;
  organizationName: string;
}

// Simple per-IP limiter for failed logins. The codes are ~98 bits of randomness, so this is
// belt-and-braces against noisy guessing rather than the real protection.
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const failures = new Map<string, { count: number; first: number }>();

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Emails the code to faculty. The code is only known right after it is created (the database
   * keeps a hash), so the admin's browser sends it back and we check it matches before mailing.
   */
  async emailCode(
    actor: User,
    orgId: string,
    input: { code: string; emails: string[]; note?: string | null },
  ) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (!org.accessCodeHash || org.accessCodeHash !== sha256(normalizeAccessCode(input.code)))
      throw new BadRequestException('That isn’t the current access code — create a new one first');
    if (this.env.EMAIL_DELIVERY === 'log')
      return { mailConfigured: false, sent: [], failed: input.emails };
    const link = `${this.env.WEB_ORIGIN.split(',')[0]}/login?mode=faculty`;
    const msg = accessCodeEmail({
      orgName: org.name,
      code: input.code.trim().toUpperCase(),
      link,
      senderName: actor.fullName,
      note: input.note,
    });
    const sent: string[] = [];
    const failed: string[] = [];
    for (const to of [...new Set(input.emails.map((e) => e.toLowerCase()))]) {
      (await this.mail.send({ to, ...msg }, 'access-code')) ? sent.push(to) : failed.push(to);
    }
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'access_code.emailed',
      entityType: 'organization',
      entityId: orgId,
      meta: { recipients: sent }, // the code itself is never logged
    });
    return { mailConfigured: true, sent, failed };
  }

  // ───────── Admin ─────────

  async status(orgId: string): Promise<AccessCodeStatus> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { accessCodeHash: true, accessCodeHint: true, accessCodeCreatedAt: true },
    });
    const activeSessions = org.accessCodeHash
      ? await this.prisma.orgAccessSession.count({
          where: { organizationId: orgId, expiresAt: { gt: new Date() } },
        })
      : 0;
    return {
      enabled: Boolean(org.accessCodeHash),
      hint: org.accessCodeHint,
      createdAt: org.accessCodeCreatedAt?.toISOString() ?? null,
      activeSessions,
    };
  }

  /** Creates (or replaces) the code. Everyone signed in with the old code is signed out. */
  async generate(actor: User, orgId: string): Promise<AccessCodeGenerated> {
    const groups = Array.from({ length: GROUPS }, () =>
      Array.from({ length: GROUP_LEN }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''),
    );
    const code = `ARC-${groups.join('-')}`;
    const hint = groups[GROUPS - 1]!;
    await this.prisma.$transaction([
      this.prisma.orgAccessSession.deleteMany({ where: { organizationId: orgId } }),
      this.prisma.organization.update({
        where: { id: orgId },
        data: {
          accessCodeHash: sha256(normalizeAccessCode(code)),
          accessCodeHint: hint,
          accessCodeCreatedAt: new Date(),
        },
      }),
    ]);
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'access_code.generated',
      entityType: 'organization',
      entityId: orgId,
    });
    return { ...(await this.status(orgId)), code };
  }

  async disable(actor: User, orgId: string): Promise<AccessCodeStatus> {
    await this.prisma.$transaction([
      this.prisma.orgAccessSession.deleteMany({ where: { organizationId: orgId } }),
      this.prisma.organization.update({
        where: { id: orgId },
        data: { accessCodeHash: null, accessCodeHint: null, accessCodeCreatedAt: null },
      }),
    ]);
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'access_code.disabled',
      entityType: 'organization',
      entityId: orgId,
    });
    return this.status(orgId);
  }

  // ───────── Faculty ─────────

  async login(
    rawCode: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AccessLoginResponse> {
    const ip = meta.ip ?? 'unknown';
    const now = Date.now();
    const f = failures.get(ip);
    if (f && now - f.first < FAIL_WINDOW_MS && f.count >= MAX_FAILS)
      throw new HttpException(
        { code: 'TOO_MANY_ATTEMPTS', message: 'Too many wrong codes. Try again in 15 minutes.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );

    const hash = sha256(normalizeAccessCode(rawCode));
    const org = await this.prisma.organization.findUnique({
      where: { accessCodeHash: hash },
      select: { id: true, name: true, status: true },
    });
    if (!org || org.status !== 'ACTIVE') {
      const entry = f && now - f.first < FAIL_WINDOW_MS ? f : { count: 0, first: now };
      entry.count++;
      failures.set(ip, entry);
      if (failures.size > 10_000) failures.clear();
      throw new UnauthorizedException({
        code: 'ACCESS_CODE_INVALID',
        message: 'That access code is not valid. Check it with ARC LABS.',
      });
    }
    failures.delete(ip);

    const token = ACCESS_TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const expiresAt = new Date(now + SESSION_MS);
    await this.prisma.orgAccessSession.create({
      data: {
        organizationId: org.id,
        tokenHash: sha256(token),
        expiresAt,
        ipAddress: meta.ip?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 300),
      },
    });
    // Tidy up expired sessions now and then.
    if (Math.random() < 0.1)
      await this.prisma.orgAccessSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return {
      token,
      organizationId: org.id,
      organizationName: org.name,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Resolves a bearer token to its session, sliding the expiry. Null when invalid/expired. */
  async resolve(token: string): Promise<AccessSessionInfo | null> {
    const s = await this.prisma.orgAccessSession.findUnique({
      where: { tokenHash: sha256(token) },
      include: { organization: { select: { name: true, status: true } } },
    });
    const now = Date.now();
    if (!s || s.expiresAt.getTime() <= now || s.organization.status !== 'ACTIVE') return null;
    if (now - s.lastSeenAt.getTime() > TOUCH_EVERY_MS)
      await this.prisma.orgAccessSession
        .update({
          where: { id: s.id },
          data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_MS) },
        })
        .catch(() => undefined);
    return {
      sessionId: s.id,
      organizationId: s.organizationId,
      organizationName: s.organization.name,
    };
  }

  me(session: AccessSessionInfo): MeResponse {
    return {
      id: ACCESS_USER_ID,
      email: '',
      fullName: `${session.organizationName} (faculty)`,
      isSuperAdmin: false,
      accessCode: true,
      memberships: [
        {
          organizationId: session.organizationId,
          organizationName: session.organizationName,
          roles: ['ORG_VIEWER'],
        },
      ],
    };
  }

  async logout(sessionId: string) {
    await this.prisma.orgAccessSession.deleteMany({ where: { id: sessionId } });
  }
}
