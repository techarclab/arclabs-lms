import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, resetDb } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ownActionLink, PasswordResetService } from '../src/auth/password-reset.service';
import type { MailService } from '../src/mail/mail.service';
import type { Env } from '../src/config/env';
import type { EmailJob } from '@arc/types';

describe('Forgot password', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDb(prisma);
  });
  afterAll(async () => {
    await app.close();
  });

  it('answers the same for any email; bad emails are rejected', async () => {
    const r = await api(app).post('/auth/forgot-password', { email: 'Someone@College.edu' });
    expect(r.status).toBe(200);
    expect(['email', 'firebase']).toContain(r.body.via);
    expect((await api(app).post('/auth/forgot-password', { email: 'nope' })).status).toBe(422);
  });

  it('turns the Firebase link into our own page', () => {
    expect(
      ownActionLink(
        'https://arc-labs-lms.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=AB_c-1&apiKey=k&continueUrl=x',
        'https://lms.arclabs.in',
      ),
    ).toBe('https://lms.arclabs.in/reset-password?mode=resetPassword&oobCode=AB_c-1');
  });

  it('with a mail server: emails our link, says nothing about unknown accounts, limits repeats', async () => {
    // no mail server at all: the browser is told to let Firebase send it
    const noMail = new PasswordResetService(
      prisma,
      {} as MailService,
      {} as never,
      {
        EMAIL_DELIVERY: 'log',
      } as Env,
    );
    expect(await noMail.request('priya@college.edu', '1.2.3.4')).toEqual({ via: 'firebase' });

    const sent: EmailJob[] = [];
    const mail = { send: async (j: EmailJob) => (sent.push(j), true) } as unknown as MailService;
    const auth = {
      getUserByEmail: async (email: string) => {
        if (email !== 'priya@college.edu')
          throw Object.assign(new Error('x'), { code: 'auth/user-not-found' });
        return { uid: 'u1', displayName: 'Priya Sharma', disabled: false };
      },
      generatePasswordResetLink: async () =>
        'https://demo.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=CODE123&apiKey=k',
    };
    const env = { EMAIL_DELIVERY: 'direct', WEB_ORIGIN: 'https://lms.arclabs.in' } as Env;
    const svc = new PasswordResetService(prisma, mail, auth as never, env);

    expect(await svc.request('priya@college.edu', '1.2.3.4')).toEqual({ via: 'email' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('priya@college.edu');
    expect(sent[0]!.subject).toBe('Reset your ARC LABS password');
    expect(sent[0]!.html).toContain(
      'https://lms.arclabs.in/reset-password?mode=resetPassword&amp;oobCode=CODE123',
    );
    expect(sent[0]!.text).toContain('Hi Priya,');

    // unknown account: same answer, no email
    expect(await svc.request('ghost@college.edu', '1.2.3.4')).toEqual({ via: 'email' });
    expect(sent).toHaveLength(1);

    // asking again within a minute: same answer, no second email
    expect(await svc.request('priya@college.edu', '1.2.3.4')).toEqual({ via: 'email' });
    expect(sent).toHaveLength(1);

    // if the mail server fails, the browser falls back to Firebase
    await prisma.auditLog.deleteMany({ where: { action: 'auth.password_reset_requested' } });
    const failing = new PasswordResetService(
      prisma,
      { send: async () => false } as unknown as MailService,
      auth as never,
      env,
    );
    expect(await failing.request('priya@college.edu', '1.2.3.4')).toEqual({ via: 'firebase' });
  });
});
