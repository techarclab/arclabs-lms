'use client';

import { useState } from 'react';
import { OctagonX } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Dialog, DialogContent } from '@arc/ui';
import { useApiMutation } from '@/lib/use-api';

/** Stops a live exam immediately: the window closes and everyone still writing is submitted. */
export function StopExamButton({
  examId,
  orgId,
  writing,
  onStopped,
  size = 'md',
}: {
  examId: string;
  orgId: string;
  /** Students currently writing, if known (shown in the confirmation). */
  writing?: number;
  onStopped: () => void;
  size?: 'sm' | 'md';
}) {
  const mutate = useApiMutation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function stop() {
    setBusy(true);
    try {
      const r = await mutate<{ submitted: number; codingPending: number }>(
        `/exams/${examId}/end`,
        'POST',
        {},
        orgId,
      );
      toast.success('Exam stopped', {
        description: `${r.submitted} submission${r.submitted === 1 ? '' : 's'} closed.${
          r.codingPending ? ' Coding answers are being marked — see Results.' : ''
        }`,
      });
      setOpen(false);
      onStopped();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="destructive" size={size} onClick={() => setOpen(true)}>
        <OctagonX /> Stop exam
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Stop this exam now?"
          description="The exam closes immediately for everyone. This can’t be undone."
          icon={<OctagonX />}
        >
          <div className="space-y-4 px-6 pt-2 pb-6">
            <ul className="space-y-1.5 text-sm text-ink-700">
              <li>
                •{' '}
                {writing !== undefined ? (
                  <b>
                    {writing} student{writing === 1 ? '' : 's'} still writing
                  </b>
                ) : (
                  'Students still writing'
                )}{' '}
                will be submitted with the answers they have saved.
              </li>
              <li>• Students who haven’t started can no longer start.</li>
              <li>• Coding answers are marked right after (on the Results page).</li>
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Keep running
              </Button>
              <Button variant="destructive" loading={busy} onClick={stop}>
                <OctagonX /> Stop exam now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
