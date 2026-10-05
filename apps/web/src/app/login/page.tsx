'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  ArrowLeft,
  Award,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Radio,
  UserRound,
} from 'lucide-react';
import { Button, cn, Field, Input } from '@arc/ui';
import { BrandLockup, Logo } from '@/components/brand/Logo';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { firebaseAuth } from '@/lib/firebase';

const FRIENDLY_ERRORS: Record<string, string> = {
  'auth/user-not-found': 'No account with this email. Switch to “Create account” to sign up.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/weak-password': 'Password is too weak — use at least 8 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a minute and try again.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/missing-email': 'Enter the email you sign in with.',
  'auth/expired-action-code': 'This link has expired. Ask for a new one.',
  'auth/invalid-action-code':
    'This link is not valid any more (it may have been used already). Ask for a new one.',
  'auth/network-request-failed':
    'Network error — check your connection (or that the auth emulator is running).',
};

function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code && FRIENDLY_ERRORS[code]) return FRIENDLY_ERRORS[code];
  return e instanceof Error ? e.message.replace('Firebase: ', '') : 'Something went wrong';
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const {
    me,
    refresh,
    error: authError,
    firebaseUser,
    loading: authLoading,
    loginWithAccessCode,
  } = useAuth();
  const initialMode = params.get('mode');
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'faculty'>(
    initialMode === 'signup' || initialMode === 'faculty' || initialMode === 'reset'
      ? initialMode
      : 'signin',
  );
  const [accessCode, setAccessCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (me) router.replace(next.startsWith('/') ? next : '/dashboard');
  }, [me, router, next]);

  // Firebase accepted the password but the ARC LABS API didn't (unreachable, CORS, rejected token).
  useEffect(() => {
    if (authLoading || !firebaseUser || me || !authError) return;
    setError(
      /fetch|network/i.test(authError)
        ? 'Signed in, but the ARC LABS server could not be reached. Please try again in a minute.'
        : `Signed in, but the ARC LABS server refused it: ${authError}`,
    );
  }, [authLoading, firebaseUser, me, authError]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'faculty') {
      setBusy(true);
      setError(null);
      loginWithAccessCode(accessCode)
        .catch((err: unknown) => {
          setAccessCode('');
          setError(
            err instanceof ApiError && err.status === 422
              ? 'Enter the full access code.'
              : err instanceof ApiError
                ? err.message
                : 'Could not reach the ARC LABS server. Please try again.',
          );
        })
        .finally(() => setBusy(false));
      return;
    }
    const auth = firebaseAuth();
    if (mode === 'reset') {
      void run(async () => {
        const addr = email.trim();
        // ARC LABS sends the email itself (from hello@arclabs.in) when a mail server is set up;
        // otherwise Firebase sends it.
        const r = await api<{ via: 'email' | 'firebase' }>('/auth/forgot-password', {
          method: 'POST',
          body: { email: addr },
        }).catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 422)
            throw new Error('Please enter a valid email address.');
          return { via: 'firebase' as const };
        });
        if (r.via === 'firebase') {
          try {
            // After setting the new password, "Continue" brings them back here with the email filled in.
            await sendPasswordResetEmail(auth, addr, {
              url: `${window.location.origin}/login?email=${encodeURIComponent(addr)}`,
            });
          } catch (e) {
            const code = (e as { code?: string }).code ?? '';
            if (!/continue-uri|unauthorized-domain/.test(code)) throw e;
            await sendPasswordResetEmail(auth, addr); // this site isn't on Firebase's list: plain link
          }
        }
        setResendIn(60);
        setNotice(
          `If ${addr} has an ARC LABS account, a link to set a new password is on its way. Open the email (check Spam / Promotions too), click the link, choose a new password, then sign in. The link works for 1 hour.`,
        );
      });
      return;
    }
    if (mode === 'signin') {
      void run(() => signInWithEmailAndPassword(auth, email, password));
      return;
    }
    void run(async () => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (fullName.trim()) {
        await updateProfile(cred.user, { displayName: fullName.trim() });
        await api('/auth/sync', {
          method: 'POST',
          body: { fullName: fullName.trim() },
          token: await cred.user.getIdToken(true),
        });
        await refresh();
      }
    });
  }

  const titles = {
    signin: ['Welcome back', 'Sign in to continue to your workspace.'],
    signup: ['Create your account', 'Join ARC LABS to start learning and building.'],
    reset: ['Reset your password', 'We’ll email you a secure link to set a new password.'],
    faculty: [
      'College faculty sign-in',
      'Enter the access code ARC LABS shared with your college. You’ll get a view-only look at exam results and students.',
    ],
  } as const;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-ink-950 lg:flex lg:flex-col">
        <div className="bg-grid absolute inset-0" />
        <div className="absolute -top-40 -left-40 size-[520px] rounded-full bg-brand-600/30 blur-[120px]" />
        <div className="absolute -right-32 -bottom-40 size-[420px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="relative flex flex-1 flex-col justify-between p-12">
          <Link href="/login" aria-label="ARC LABS">
            <BrandLockup inverted className="w-44" />
          </Link>

          <div className="max-w-lg">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-cyan-300">
              <span className="size-1.5 animate-pulse rounded-full bg-cyan-400" /> AIoT learning
              platform
            </p>
            <h1 className="text-[40px] leading-[1.1] font-semibold tracking-tight text-white">
              Train the people who build the connected world.
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
              Courses, live batches, hands-on projects and verifiable certificates — one platform
              for every ARC LABS program.
            </p>

            <div className="mt-10 grid gap-3">
              {[
                {
                  icon: Cpu,
                  title: 'Hands-on by design',
                  text: 'ESP32, Arduino and sensor projects built into every course.',
                },
                {
                  icon: Radio,
                  title: 'Real hardware, real data',
                  text: 'IoT device integration and virtual labs on the roadmap.',
                },
                {
                  icon: Award,
                  title: 'Certificates that verify',
                  text: 'Every certificate carries a QR code anyone can check.',
                },
              ].map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="flex gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 backdrop-blur"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/30 to-cyan-500/20 text-cyan-200 ring-1 ring-white/10">
                    <Icon className="size-5" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="mt-0.5 text-[13px] text-ink-400">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-ink-500">
            © {new Date().getFullYear()} ARC LABS. All rights reserved.
          </p>
        </div>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>

          {mode !== 'reset' && mode !== 'faculty' && (
            <div className="mb-8 grid grid-cols-2 rounded-xl bg-ink-100 p-1">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className={cn(
                    'rounded-lg py-2 text-sm font-medium transition',
                    mode === m
                      ? 'bg-white text-ink-900 shadow-sm'
                      : 'text-ink-500 hover:text-ink-800',
                  )}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          )}

          {(mode === 'reset' || mode === 'faculty') && (
            <button
              className="mb-8 flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
              onClick={() => {
                setMode('signin');
                setError(null);
                setNotice(null);
                setAccessCode('');
              }}
            >
              <ArrowLeft className="size-4" /> Back to sign in
            </button>
          )}

          <h2 className="text-2xl font-semibold tracking-tight">{titles[mode][0]}</h2>
          <p className="mt-1.5 text-[15px] text-ink-500">{titles[mode][1]}</p>

          {(mode === 'signin' || mode === 'signup') && (
            <>
              <Button
                variant="secondary"
                size="lg"
                className="mt-8 w-full"
                disabled={busy}
                onClick={() => run(() => signInWithPopup(firebaseAuth(), new GoogleAuthProvider()))}
              >
                <GoogleIcon /> Continue with Google
              </Button>
              <div className="my-6 flex items-center gap-3 text-xs text-ink-400">
                <span className="h-px flex-1 bg-ink-200" /> or with email{' '}
                <span className="h-px flex-1 bg-ink-200" />
              </div>
            </>
          )}

          <form
            onSubmit={onSubmit}
            className={cn('space-y-4', (mode === 'reset' || mode === 'faculty') && 'mt-8')}
          >
            {mode === 'faculty' && (
              <Field label="Access code" htmlFor="access-code">
                {/* Masked on purpose: the code is typed but never shown on screen. */}
                <Input
                  id="access-code"
                  type="password"
                  required
                  minLength={8}
                  maxLength={64}
                  leading={<KeyRound />}
                  placeholder="••••-••••-••••-••••"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoFocus
                  className="h-11 tracking-widest"
                />
              </Field>
            )}
            {mode === 'signup' && (
              <Field label="Full name" htmlFor="name">
                <Input
                  id="name"
                  leading={<UserRound />}
                  placeholder="Priya Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  className="h-11"
                />
              </Field>
            )}
            {mode !== 'faculty' && (
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  required
                  leading={<Mail />}
                  placeholder="you@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="h-11"
                />
              </Field>
            )}
            {(mode === 'signin' || mode === 'signup') && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-ink-800">
                    Password
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setError(null);
                        setNotice(null);
                      }}
                      className="text-[13px] font-medium text-brand-600 hover:text-brand-700"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  required
                  minLength={8}
                  leading={<Lock />}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="h-11"
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  }
                />
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-700">
                {notice}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={busy}
              disabled={mode === 'reset' && resendIn > 0}
            >
              {mode === 'signin' || mode === 'faculty'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : resendIn > 0
                    ? `Send again in ${resendIn}s`
                    : notice
                      ? 'Send the link again'
                      : 'Send reset link'}
            </Button>
            {mode === 'signin' && (
              <p className="text-center text-[13px] text-ink-500">
                Forgot your password?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('reset');
                    setError(null);
                    setNotice(null);
                  }}
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  Reset it here
                </button>
              </p>
            )}
            {(mode === 'signin' || mode === 'signup') && (
              <p className="text-center text-[12px] text-ink-400">
                For your safety you are signed out when you close this tab or the browser.
              </p>
            )}
          </form>

          {(mode === 'signin' || mode === 'signup') && (
            <Link
              href="/join"
              className="mt-6 flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3 text-sm transition hover:border-brand-300 hover:bg-brand-50/50"
            >
              <span>
                <span className="block font-medium text-ink-900">
                  Registering for your college?
                </span>
                <span className="block text-[13px] text-ink-500">
                  Enter the join code your college shared
                </span>
              </span>
              <span className="text-brand-600">→</span>
            </Link>
          )}
          {(mode === 'signin' || mode === 'signup') && (
            <button
              type="button"
              onClick={() => {
                setMode('faculty');
                setError(null);
              }}
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-ink-200 px-4 py-3 text-left text-sm transition hover:border-brand-300 hover:bg-brand-50/50"
            >
              <span>
                <span className="block font-medium text-ink-900">College faculty?</span>
                <span className="block text-[13px] text-ink-500">
                  Sign in with your college’s access code
                </span>
              </span>
              <KeyRound className="size-4 text-brand-600" />
            </button>
          )}

          <p className="mt-8 text-center text-xs leading-relaxed text-ink-400">
            By continuing you agree to the ARC LABS terms of service and privacy policy.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
