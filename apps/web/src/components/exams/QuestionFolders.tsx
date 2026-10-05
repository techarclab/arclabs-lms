'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Folder, FolderInput, FolderOpen, Inbox, Layers } from 'lucide-react';
import type { QuestionFolders } from '@arc/types';
import { NO_FOLDER } from '@arc/validation';
import { Button, cn, Dialog, DialogContent, Field, Input } from '@arc/ui';

/** "Unit3_40_MCQs_Import.pdf" → "Unit3 40 MCQs Import" */
export function folderFromFileName(name: string) {
  return name
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Folder chips: All · each folder · Not in a folder. `value` '' = all. */
export function FolderBar({
  data,
  value,
  onChange,
}: {
  data: QuestionFolders | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  if (!data || (!data.folders.length && !value)) return null;
  const total = data.folders.reduce((s, f) => s + f.count, 0) + data.unfiled;
  const chip = (key: string, label: string, count: number, icon: ReactNode) => {
    const on = value.toLowerCase() === key.toLowerCase();
    return (
      <button
        key={key || 'all'}
        onClick={() => onChange(on && key ? '' : key)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition [&_svg]:size-3.5',
          on
            ? 'border-brand-600 bg-brand-600 text-white'
            : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
        )}
      >
        {icon}
        {label}
        <span className={cn('tabular ml-0.5', on ? 'text-white/70' : 'text-ink-400')}>{count}</span>
      </button>
    );
  };
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {chip('', 'All questions', total, <Layers />)}
      {data.folders.map((f) =>
        chip(
          f.name,
          f.name,
          f.count,
          value.toLowerCase() === f.name.toLowerCase() ? <FolderOpen /> : <Folder />,
        ),
      )}
      {data.unfiled > 0 &&
        data.folders.length > 0 &&
        chip(NO_FOLDER, 'Not in a folder', data.unfiled, <Inbox />)}
    </div>
  );
}

/** Asks for a folder name (move questions into a folder, or rename a folder). */
export function FolderDialog({
  open,
  onOpenChange,
  title,
  description,
  initial = '',
  folders,
  confirmLabel,
  allowEmpty = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  initial?: string;
  folders: string[];
  confirmLabel: string;
  /** Empty name = take the questions out of their folder. */
  allowEmpty?: boolean;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!allowEmpty && !name.trim()) return;
    setBusy(true);
    try {
      await onSubmit(name.trim());
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} icon={<FolderInput />}>
        <form onSubmit={submit}>
          <div className="space-y-3 px-6 pt-4 pb-6">
            <Field
              label="Folder name"
              htmlFor="folder-name"
              hint={allowEmpty ? 'Leave empty to take them out of their folder.' : undefined}
            >
              <Input
                id="folder-name"
                autoFocus
                list="folder-dialog-list"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Unit 3 assignment"
                maxLength={80}
              />
              <datalist id="folder-dialog-list">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Field>
            {folders.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {folders.slice(0, 12).map((f) => (
                  <button
                    type="button"
                    key={f}
                    onClick={() => setName(f)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[12px] transition',
                      name === f
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-ink-200 text-ink-600 hover:border-ink-300',
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!allowEmpty && !name.trim()}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
