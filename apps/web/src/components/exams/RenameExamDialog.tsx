'use client';

import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { ExamDetail } from '@arc/types';
import { Button, Dialog, DialogContent, Field, Input } from '@arc/ui';
import { useApiMutation } from '@/lib/use-api';

/** Renames an exam. Allowed in every state (draft, scheduled, live or closed). */
export function RenameExamDialog({
  examId,
  orgId,
  title,
  open,
  onOpenChange,
  onRenamed,
}: {
  examId: string;
  orgId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed: (exam: ExamDetail) => void;
}) {
  const mutate = useApiMutation();
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue(title);
  }, [open, title]);

  const name = value.trim();
  const error =
    name.length < 3
      ? 'Use at least 3 characters'
      : name.length > 200
        ? 'Keep it under 200 characters'
        : '';

  async function save() {
    if (error) return;
    if (name === title) return onOpenChange(false);
    setBusy(true);
    try {
      const e = await mutate<ExamDetail>(`/exams/${examId}`, 'PATCH', { title: name }, orgId);
      toast.success('Exam renamed');
      onRenamed(e);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Rename exam"
        description="Students see the new name on their exam list and start page right away."
        icon={<Pencil />}
      >
        <form
          className="space-y-4 px-6 pt-2 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Exam name" htmlFor="rename-exam" error={value && error ? error : undefined}>
            <Input
              id="rename-exam"
              autoFocus
              value={value}
              maxLength={200}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!!error}>
              Save name
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
