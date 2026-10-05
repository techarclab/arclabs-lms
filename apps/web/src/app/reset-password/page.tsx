'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  applyActionCode,
  confirmPasswordReset,
  signInWithEmailAndPassword,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { CheckCircle2, Eye, EyeOff, Lock, TriangleAlert } from 'lucide-react';
import { Button, Field, Input } from '@arc/ui';
import { Logo } from '@/components/brand/Logo';
import { firebaseAuth } from '@/lib/firebase';

/**
 * Opens from the "reset your password" email (Firebase → Authentication → Templates →
 * Customize action URL = https://<site>/reset-password). Also handles the other email links.
 */
function friendly(e: unknown) {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'auth/expired-action-code') return 'This link has expired. Ask for a new one.';
  if (code === 'auth/invalid-action-code')
    return 'This link is not valid any more (it may have been used already). Ask for a new one.';
  if (code === 'auth/weak-password') return 'Password is too weak — use at least 8 characters.';
  if (code === 'auth/user-disabled') return 'This account has been disabled.';
  if (code === 'auth/network-request-failed') return 'Network error — check your connection.';
  return e instanceof Error ? e.message.replace('Firebase: ', '') : 'Something went wrong';
}

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const mode = params.get('mode') ?? 'resetPassword';
  const code = params.get('oobCode') ?? '';
  const [state, setState] = useState<'checking' | 'form' | 'done' | 'bad'>('checking');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError('This link is incomplete. Open it again from the email, or ask for a new one.');
      setState('bad');
      return;
    }
    const auth = firebaseAuth();
    if (mode === 'resetPassword') {
      verifyPasswordResetCode(auth, code)
        .then((addr) => {
          setEmail(addr);
          setState('form');
        })
        .catch((e) => {
          setError(friendly(e));
          setState('bad');
        });
    } else {
      // verifyEmail / recoverEmail / verifyAndChangeEmail
      applyActionCode(auth, code)
        .then(() => setState('done'))
        .catch((e) => {
          setError(friendly(e));
          setState('bad');
        });
    }
  }, [code, mode]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError('The two passwords don’t match.');
    setBusy(true);
    setError(null);
    const auth = firebaseAuth();
    try {
      await confirmPasswordReset(auth, code, pw);
    } catch (err) {
      setError(friendly(err));
      setBusy(false);
      return;
    }
    setState('done');
    // Sign straight in with the new password (if that fails, the "Go to sign in" button is there).
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      router.replace('/dashboard');
    } catch {
      /* stay on the "Password changed" screen */
    }
    setBusy(false);
  }

  const loginHref = `/login${email ? `?email=${encodeURIComponent(email)}` : ''}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-6 py-12">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-8 shadow-sm ring-1 ring-ink-100">
        <div className="mb-8">
          <Logo />
        </div>

        {state === 'checking' && <p className="text-sm text-ink-500">Checking the link…</p>}

        {state === 'bad' && (
          <>
            <TriangleAlert className="mb-3 size-8 text-amber-500" />
            <h1 className="text-xl font-semibold tracking-tight">Link not working</h1>
            <p className="mt-2 text-[14px] text-ink-600">{error}</p>
            <Button asChild className="mt-6 w-full" size="lg">
              <Link href="/login?mode=reset">Send me a new link</Link>
            </Button>
          </>
        )}

        {state === 'done' && (
          <>
            <CheckCircle2 className="mb-3 size-8 text-emerald-500" />
            <h1 className="text-xl font-semibold tracking-tight">
              {mode === 'resetPassword' ? 'Password changed' : 'Done'}
            </h1>
            <p className="mt-2 text-[14px] text-ink-600">
              {mode === 'resetPassword'
                ? 'Signing you in with your new password…'
                : 'Your email has been updated. You can sign in now.'}
            </p>
            <Button asChild variant="secondary" className="mt-6 w-full" size="lg">
              <Link href={loginHref}>Go to sign in</Link>
            </Button>
          </>
        )}

        {state === 'form' && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
              <p className="mt-1.5 text-[14px] text-ink-500">
                For <b className="font-medium text-ink-800">{email}</b>
              </p>
            </div>
            <Field label="New password" htmlFor="pw">
              <Input
                id="pw"
                type={show ? 'text' : 'password'}
                required
                minLength={8}
                autoFocus
                leading={<Lock />}
                placeholder="At least 8 characters"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                className="h-11"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                }
              />
            </Field>
            <Field label="Type it again" htmlFor="pw2">
              <Input
                id="pw2"
                type={show ? 'text' : 'password'}
                required
                leading={<Lock />}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                className="h-11"
              />
            </Field>
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">
                {error}
              </div>
            )}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Save new password
            </Button>
            <p className="text-center text-[13px] text-ink-500">
              Remembered it?{' '}
              <Link href={loginHref} className="font-medium text-brand-600 hover:text-brand-700">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
