'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { Button, Card } from '@arc/ui';
import { useAuth } from '@/components/AuthProvider';
import { firebaseAuth } from '@/lib/firebase';

export default function LoginPage() {
  const router = useRouter();
  const { me } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (me) router.replace('/dashboard');
  }, [me, router]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message.replace('Firebase: ', '') : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const auth = firebaseAuth();
    void run(() =>
      mode === 'signin'
        ? signInWithEmailAndPassword(auth, email, password)
        : createUserWithEmailAndPassword(auth, email, password),
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="text-sm text-slate-500">ARC LABS Learning Platform</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <Button type="submit" disabled={busy} className="w-full">
            {mode === 'signin' ? 'Sign in' : 'Sign up'}
          </Button>
        </form>

        <Button
          variant="secondary"
          disabled={busy}
          className="w-full"
          onClick={() => run(() => signInWithPopup(firebaseAuth(), new GoogleAuthProvider()))}
        >
          Continue with Google
        </Button>

        <div className="flex justify-between text-sm">
          <button
            className="text-brand-600 hover:underline"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin' ? 'Create an account' : 'Have an account? Sign in'}
          </button>
          <button
            className="text-slate-500 hover:underline"
            onClick={() =>
              email
                ? run(async () => {
                    await sendPasswordResetEmail(firebaseAuth(), email);
                    setMessage('Password reset email sent.');
                  })
                : setMessage('Enter your email first.')
            }
          >
            Forgot password?
          </button>
        </div>

        {message && <p className="text-sm text-red-600">{message}</p>}
      </Card>
    </main>
  );
}
