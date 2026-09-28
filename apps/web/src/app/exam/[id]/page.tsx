'use client';

import { use, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, MonitorSmartphone } from 'lucide-react';
import type { AttemptSession, ExamLobby as Lobby } from '@arc/types';
import { Button, Card, EmptyState } from '@arc/ui';
import { ExamLobby } from '@/components/exams/ExamLobby';
import { ExamRunner } from '@/components/exams/ExamRunner';
import { enterFullscreen, exitFullscreen } from '@/components/exams/useLockdown';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';

export default function TakeExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const { loading, firebaseUser, getToken } = useAuth();
  const {
    data: lobby,
    error,
    mutate,
  } = useApi<Lobby>(`/my/exams/${id}`, {
    refreshInterval: (d) => (d?.state === 'SCHEDULED' ? 5000 : 0),
  });
  const [session, setSession] = useState<AttemptSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [replaced, setReplaced] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, firebaseUser, router, pathname]);

  async function start() {
    setStarting(true);
    setStartError(null);
    // Must be called directly from the click so the browser allows full screen.
    if (lobby?.requireFullscreen && !(await enterFullscreen())) {
      setStartError(
        'Your browser blocked full-screen mode. Allow it and try again (a desktop browser is required).',
      );
      setStarting(false);
      return;
    }
    try {
      const s = await api<AttemptSession>(`/my/exams/${id}/start`, {
        method: 'POST',
        body: {},
        token: await getToken(),
      });
      setReplaced(false);
      setSession(s);
    } catch (e) {
      await exitFullscreen();
      const code = e instanceof ApiError ? e.body?.error.code : undefined;
      if (code === 'AUTO_SUBMITTED') {
        const attemptId = (e as ApiError).body?.error.details as { attemptId?: string } | undefined;
        router.replace(`/my-exams/result/${attemptId?.attemptId ?? ''}`);
        return;
      }
      setStartError((e as Error).message);
      void mutate();
    } finally {
      setStarting(false);
    }
  }

  if (replaced) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
        <Card className="max-w-md">
          <EmptyState
            icon={<MonitorSmartphone />}
            title="This exam is open in another window"
            description="Only one window can be used at a time. Continuing here takes over from the other window and is recorded as a violation."
            action={
              <Button onClick={start} loading={starting}>
                Continue in this window
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  if (session)
    return (
      <ExamRunner
        session={session}
        onSessionReplaced={() => {
          void exitFullscreen();
          setSession(null);
          setReplaced(true);
        }}
      />
    );

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
        <Card className="max-w-md">
          <EmptyState
            title="Exam not available"
            description="It may not be assigned to you, or it has been removed."
            action={
              <Button variant="secondary" onClick={() => router.push('/my-exams')}>
                Back to my exams
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-ink-400" />
      </div>
    );
  }

  return <ExamLobby lobby={lobby} onStart={start} starting={starting} error={startError} />;
}
