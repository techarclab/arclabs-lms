import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { JoinCodeForm } from '@/components/join/JoinCodeForm';

export const metadata = { title: 'Join your college' };

export default function JoinCodePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-6">
      <Link href="/" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-md rounded-3xl border border-ink-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Join your college</h1>
        <p className="mt-1.5 text-[15px] text-ink-500">
          Enter the join code your college or trainer shared with you.
        </p>
        <JoinCodeForm className="mt-6" />
        <p className="mt-6 text-sm text-ink-500">
          Already registered?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
