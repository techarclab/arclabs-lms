'use client';

import { use, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  CheckCircle2,
  GraduationCap,
  Hash,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { JoinInfo, JoinResult } from '@arc/types';
import { emailOnDomains, joinOrganizationSchema } from '@arc/validation';
import { Avatar, Button, cn, Field, Input, Select } from '@arc/ui';
import { Logo } from '@/components/brand/Logo';
import { JoinCodeForm } from '@/components/join/JoinCodeForm';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { firebaseAuth } from '@/lib/firebase';
import { ORG_TYPE_LABEL } from '@/lib/format';

const AUTH_ERRORS: Record<string, string> = {
  'auth/email-already-in-use':
    'An account with this email already exists — switch to “I already have an account”.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-not-found': 'No account with this email. Switch to “New student”.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/weak-password': 'Use at least 8 characters for your password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
};
const authError = (e: unknown) =>
  AUTH_ERRORS[(e as { code?: string }).code ?? ''] ??
  (e instanceof Error ? e.message.replace('Firebase: ', '') : 'Something went wrong');

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const { loading, firebaseUser, me, getToken, refresh } = useAuth();
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [fullName, setFullName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [email, setEmail] = useState('');
  const [collegeEmail, setCollegeEmail] = useState('');
  const [loginTouched, setLoginTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinResult | null>(null);

  useEffect(() => {
    api<JoinInfo>(`/join/${encodeURIComponent(code)}`)
      .then(setInfo)
      .catch((e) => setInvalid(e instanceof ApiError ? e.message : 'Could not load this link'));
  }, [code]);

  useEffect(() => {
    if (me && !fullName) setFullName(me.fullName);
  }, [me, fullName]);

  const alreadyMember = Boolean(
    info && me?.memberships.some((m) => m.organizationId === info.organizationId),
  );

  async function completeJoin(token: string | undefined, name: string) {
    const r = await api<JoinResult>(`/join/${encodeURIComponent(code)}`, {
      method: 'POST',
      token,
      body: { fullName: name, externalId: rollNo, departmentId, collegeEmail },
    });
    try {
      localStorage.setItem('arc.currentOrgId', r.organizationId);
    } catch {
      /* ignore */
    }
    await refresh();
    setJoined(r);
    setTimeout(() => router.push('/my-exams'), 1800);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const details = joinOrganizationSchema.safeParse({
      fullName,
      externalId: rollNo,
      departmentId,
      collegeEmail,
    });
    if (!details.success) {
      setError(details.error.issues[0]?.message ?? 'Check your details');
      return;
    }
    if (info && !emailOnDomains(collegeEmail, info.collegeEmailDomains)) {
      setError(`Use your college email (ending in @${info.collegeEmailDomains.join(' or @')})`);
      return;
    }
    if (!firebaseUser && (!email.trim() || !password)) {
      setError('Enter your email and password');
      return;
    }
    setBusy(true);
    try {
      let token: string | undefined;
      if (firebaseUser) token = await getToken();
      else if (mode === 'new') {
        const cred = await createUserWithEmailAndPassword(firebaseAuth(), email, password);
        await updateProfile(cred.user, { displayName: fullName.trim() });
        token = await cred.user.getIdToken(true);
      } else {
        const cred = await signInWithEmailAndPassword(firebaseAuth(), email, password);
        token = await cred.user.getIdToken();
      }
      await completeJoin(token, fullName.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : authError(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    setBusy(true);
    try {
      const cred = await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
      if (!fullName) setFullName(cred.user.displayName ?? '');
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <Shell>
        <div className="w-full max-w-md rounded-3xl border border-ink-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold">This join link isn’t working</h1>
          <p className="mt-2 text-[15px] text-ink-500">{invalid}</p>
          <p className="mt-6 mb-2 text-sm font-medium text-ink-800">Try a different code</p>
          <JoinCodeForm />
        </div>
      </Shell>
    );
  }

  if (!info || loading) {
    return (
      <Shell>
        <Loader2 className="size-6 animate-spin text-ink-400" />
      </Shell>
    );
  }

  const color = info.primaryColor ?? '#2F45EF';

  return (
    <Shell>
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-sm md:grid-cols-[1fr_1.15fr]">
        {/* College panel */}
        <div
          className="relative overflow-hidden p-8 text-white"
          style={{ background: `linear-gradient(150deg, ${color} 0%, #0a0d16 110%)` }}
        >
          <div className="bg-grid absolute inset-0 opacity-50" />
          <div className="relative flex h-full flex-col">
            <Avatar
              name={info.organizationName}
              color="rgba(255,255,255,0.15)"
              size="lg"
              className="ring-1 ring-white/25"
            />
            <p className="mt-6 text-sm font-medium text-white/70">
              {ORG_TYPE_LABEL[info.organizationType] ?? 'Organization'} · student registration
            </p>
            <h1 className="mt-1 text-3xl leading-tight font-semibold tracking-tight">
              {info.organizationName}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-white/75">
              Register once to see and take the exams your college schedules on the ARC LABS
              platform.
            </p>
            <ul className="mt-auto space-y-2.5 pt-8 text-sm text-white/85">
              <li className="flex items-center gap-2.5">
                <GraduationCap className="size-4" /> Exams appear on your dashboard automatically
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="size-4" /> Instant scores and rank after each exam
              </li>
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="size-4" /> Your data stays with your college
              </li>
            </ul>
            <p className="mt-6 font-mono text-xs tracking-widest text-white/50">
              CODE · {info.code}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="p-8">
          {joined ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="size-7" />
              </span>
              <h2 className="mt-4 text-xl font-semibold">
                {joined.alreadyMember ? 'You’re already registered' : 'You’re registered!'}
              </h2>
              <p className="mt-1.5 text-ink-500">
                Taking you to your exams at {joined.organizationName}…
              </p>
            </div>
          ) : alreadyMember ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <CheckCircle2 className="size-10 text-emerald-500" />
              <h2 className="mt-4 text-xl font-semibold">
                You’re already part of {info.organizationName}
              </h2>
              <Button className="mt-6" asChild>
                <Link href="/my-exams">Go to my exams</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Student registration</h2>
                {firebaseUser ? (
                  <p className="mt-1 flex items-center gap-2 text-sm text-ink-500">
                    Signed in as <b className="font-medium text-ink-800">{firebaseUser.email}</b>
                    <button
                      type="button"
                      className="text-brand-600 hover:underline"
                      onClick={() => signOut(firebaseAuth())}
                    >
                      Not you?
                    </button>
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-2 rounded-xl bg-ink-100 p-1">
                    {(['new', 'existing'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
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
                        {m === 'new' ? 'New student' : 'I already have an account'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Field label="Full name (as in college records)" htmlFor="j-name" required>
                <Input
                  id="j-name"
                  required
                  leading={<UserRound />}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Priya Sharma"
                  autoComplete="name"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Roll / hall ticket no." htmlFor="j-roll" required>
                  <Input
                    id="j-roll"
                    required
                    leading={<Hash />}
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value.toUpperCase())}
                    placeholder="22EG105A01"
                    className="font-mono uppercase"
                  />
                </Field>
                <Field label="Department" htmlFor="j-dept" required>
                  <Select
                    id="j-dept"
                    required
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                  >
                    <option value="">Choose your department…</option>
                    {info.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field
                label="College email"
                htmlFor="j-college"
                required
                hint={
                  info.collegeEmailDomains.length
                    ? `The email your college gave you (…@${info.collegeEmailDomains.join(' or …@')}). Exam reminders are sent here.`
                    : 'The email your college gave you. Exam reminders are sent here.'
                }
              >
                <Input
                  id="j-college"
                  required
                  type="email"
                  leading={<Mail />}
                  value={collegeEmail}
                  onChange={(e) => {
                    setCollegeEmail(e.target.value.trim());
                    // New accounts log in with the college email unless they choose another.
                    if (!loginTouched) setEmail(e.target.value.trim());
                  }}
                  placeholder={
                    info.collegeEmailDomains[0]
                      ? `rollno@${info.collegeEmailDomains[0]}`
                      : 'you@college.edu'
                  }
                  autoComplete="email"
                />
              </Field>

              {!firebaseUser && (
                <>
                  <Field label="Login email" htmlFor="j-email" required>
                    <Input
                      id="j-email"
                      required
                      type="email"
                      leading={<Mail />}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setLoginTouched(true);
                      }}
                      placeholder="you@college.edu"
                      autoComplete="email"
                    />
                  </Field>
                  <Field
                    label={mode === 'new' ? 'Create a password' : 'Password'}
                    htmlFor="j-pw"
                    required
                  >
                    <Input
                      id="j-pw"
                      required
                      type="password"
                      leading={<Lock />}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'new' ? 'At least 8 characters' : '••••••••'}
                      autoComplete={mode === 'new' ? 'new-password' : 'current-password'}
                    />
                  </Field>
                </>
              )}

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">
                  {error}
                </div>
              )}

              <Button type="submit" size="lg" className="w-full" loading={busy}>
                {firebaseUser
                  ? `Join ${info.organizationName}`
                  : mode === 'new'
                    ? 'Create account & join'
                    : 'Sign in & join'}
              </Button>
              {!firebaseUser && (
                <>
                  <div className="flex items-center gap-3 text-xs text-ink-400">
                    <span className="h-px flex-1 bg-ink-200" /> or{' '}
                    <span className="h-px flex-1 bg-ink-200" />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    disabled={busy}
                    onClick={google}
                  >
                    Continue with Google
                  </Button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-ink-50 px-4 py-10">
      <Link href="/login">
        <Logo />
      </Link>
      {children}
    </div>
  );
}
