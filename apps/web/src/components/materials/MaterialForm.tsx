'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Building, Check, CheckCircle2, Link2, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import type {
  DepartmentSummary,
  MaterialAdminItem,
  MaterialFolderItem,
  MaterialLinkInfo,
  MaterialType,
} from '@arc/types';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  Field,
  Input,
  Select,
  SwitchRow,
  Textarea,
} from '@arc/ui';
import { ApiError } from '@/lib/api';
import { useApi, useApiMutation } from '@/lib/use-api';
import { folderTree, PROVIDER_LABEL, TYPE_META, TypeIcon } from './shared';

type Check =
  | { valid: false }
  | {
      valid: true;
      url: string;
      link: MaterialLinkInfo;
      access: 'public' | 'private' | 'not-found' | 'unknown';
    };

const TYPES = Object.keys(TYPE_META) as MaterialType[];

export function MaterialForm({
  open,
  onOpenChange,
  orgId,
  folders,
  editing,
  defaultFolderId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  folders: MaterialFolderItem[];
  editing: MaterialAdminItem | null;
  defaultFolderId: string | null;
  onSaved: () => void;
}) {
  const mutate = useApiMutation();
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const { data: departments = [] } = useApi<DepartmentSummary[]>(open ? '/departments' : null, {
    orgId,
  });
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fileType, setFileType] = useState<MaterialType | ''>('');
  const [folderId, setFolderId] = useState<string>('');
  const [all, setAll] = useState(true);
  const [depts, setDepts] = useState<string[]>([]);
  const [allowDownload, setAllowDownload] = useState(true);
  const [published, setPublished] = useState(true);
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fill the form each time it opens.
  useEffect(() => {
    if (!open) return;
    setUrl(editing?.url ?? '');
    setTitle(editing?.title ?? '');
    setDescription(editing?.description ?? '');
    setFileType(editing && editing.type !== editing.link.type ? editing.type : '');
    setFolderId(editing ? (editing.folderId ?? '') : (defaultFolderId ?? ''));
    setAll(editing?.assignToAll ?? true);
    setDepts(editing?.departments.map((d) => d.id) ?? []);
    setAllowDownload(editing?.allowDownload ?? true);
    setPublished(editing?.published ?? true);
    setCheck(null);
    setErrors({});
  }, [open, editing, defaultFolderId]);

  // Look at the link as the admin types / pastes it.
  useEffect(() => {
    if (!open || !url.trim()) {
      setCheck(null);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const r = await mutateRef.current<Check>('/materials/check-link', 'POST', { url }, orgId);
        if (!stale) setCheck(r);
      } catch {
        if (!stale) setCheck(null);
      } finally {
        if (!stale) setChecking(false);
      }
    }, 500);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [url, open, orgId]);

  const link = check?.valid ? check.link : null;
  const detected = link?.type ?? 'link';
  const canDownload = Boolean(link?.downloadUrl);

  async function save() {
    const errs: Record<string, string> = {};
    if (!url.trim()) errs.url = 'Paste a link';
    else if (check && !check.valid) errs.url = 'Enter a valid link (https://…)';
    if (title.trim().length < 2) errs.title = 'Enter a title';
    if (!all && depts.length === 0) errs.depts = 'Choose at least one department';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const body = {
      url,
      title,
      description: description || null,
      fileType: fileType || null,
      folderId: folderId || null,
      assignToAll: all,
      departmentIds: all ? [] : depts,
      allowDownload,
      published,
    };
    try {
      const r = await mutate<MaterialAdminItem & { access: string }>(
        editing ? `/materials/${editing.id}` : '/materials',
        editing ? 'PATCH' : 'POST',
        body,
        orgId,
      );
      if (r.access === 'private')
        toast.warning('Saved — but the Google file looks private. Students won’t be able to open it.', {
          duration: 9000,
        });
      else toast.success(editing ? 'Material updated' : published ? 'Shared with students' : 'Saved as hidden');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const err = e as ApiError;
      const details = (err.body?.error.details ?? []) as { path: string; message: string }[];
      if (Array.isArray(details) && details.length) setErrors(Object.fromEntries(details.map((d) => [d.path, d.message])));
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const tree = folderTree(folders);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit material' : 'Share a material'}
        description="Paste a Google Drive, Google Docs/Slides, YouTube, Dropbox, OneDrive or website link."
        icon={<Link2 />}
        className="max-w-2xl"
      >
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 pt-3 pb-2">
          <Field label="Link" htmlFor="m-url" required error={errors.url}>
            <Input
              id="m-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/…"
              autoFocus
            />
          </Field>

          {(checking || link) && (
            <div className="flex items-start gap-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3.5">
              {checking && !link ? (
                <Loader2 className="mt-0.5 size-4 animate-spin text-ink-400" />
              ) : (
                <TypeIcon type={fileType || detected} className="size-9" />
              )}
              {link && (
                <div className="min-w-0 flex-1 text-[13px]">
                  <p className="font-medium text-ink-900">
                    {PROVIDER_LABEL[link.provider]} · {TYPE_META[fileType || detected].label}
                  </p>
                  <p className="text-ink-600">
                    {link.embedUrl ? 'Opens inside the portal' : 'Opens in a new tab'}
                    {link.downloadUrl ? ' · can be downloaded' : ' · no direct download'}
                  </p>
                  {check?.valid && check.access === 'private' && (
                    <p className="mt-2 flex gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-amber-900 ring-1 ring-amber-200">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        This file is private. In Google Drive click <b>Share</b> → General access →{' '}
                        <b>Anyone with the link</b> (Viewer), then save.
                      </span>
                    </p>
                  )}
                  {check?.valid && check.access === 'not-found' && (
                    <p className="mt-2 flex gap-1.5 rounded-lg bg-rose-50 px-2.5 py-2 text-rose-800 ring-1 ring-rose-200">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      Google says this file doesn’t exist. Check the link.
                    </p>
                  )}
                  {check?.valid && check.access === 'public' && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle2 className="size-3.5" /> Anyone with the link can open it
                    </p>
                  )}
                  {(link.provider === 'google-drive' || link.provider === 'google-docs') &&
                    check?.valid &&
                    check.access === 'unknown' && (
                      <p className="mt-1.5 text-ink-500">
                        Make sure the file is shared as “Anyone with the link”.
                      </p>
                    )}
                </div>
              )}
            </div>
          )}

          <Field label="Title" htmlFor="m-title" required error={errors.title}>
            <Input
              id="m-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Unit 1 notes — Microcontrollers"
              maxLength={200}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject / unit" htmlFor="m-folder">
              <Select id="m-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">Not in a folder</option>
                {tree.map((s) => [
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>,
                  ...s.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {s.name} › {u.name}
                    </option>
                  )),
                ])}
              </Select>
            </Field>
            <Field label="Type" htmlFor="m-type" hint="Shown as the icon students see.">
              <Select
                id="m-type"
                value={fileType}
                onChange={(e) => setFileType(e.target.value as MaterialType | '')}
              >
                <option value="">Automatic ({TYPE_META[detected].label})</option>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Description" htmlFor="m-desc" optional>
            <Textarea
              id="m-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What’s in it, or what students should do with it"
              maxLength={2000}
            />
          </Field>

          <div className="space-y-2.5">
            <p className="text-sm font-medium text-ink-800">Who can see it</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { v: true, label: 'All students', icon: Users },
                { v: false, label: 'Chosen departments', icon: Building },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setAll(o.v)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition',
                    all === o.v
                      ? 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500'
                      : 'border-ink-200 text-ink-700 hover:border-ink-300',
                  )}
                >
                  <o.icon className="size-4" />
                  {o.label}
                </button>
              ))}
            </div>
            {!all && (
              <div>
                {departments.length === 0 ? (
                  <p className="text-[13px] text-ink-500">No departments yet — add them in People.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {departments.map((d) => {
                      const on = depts.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() =>
                            setDepts(on ? depts.filter((x) => x !== d.id) : [...depts, d.id])
                          }
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition',
                            on
                              ? 'border-brand-500 bg-brand-600 text-white'
                              : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
                          )}
                        >
                          {on && <Check className="size-3.5" />}
                          {d.name}
                          <span className={on ? 'text-brand-100' : 'text-ink-400'}>
                            {d.memberCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.depts && <p className="mt-1.5 text-[13px] text-rose-600">{errors.depts}</p>}
              </div>
            )}
          </div>

          <div className="divide-y divide-ink-100 rounded-xl border border-ink-200">
            <SwitchRow
              className="px-4 py-3"
              label="Allow download"
              description={
                link && !canDownload
                  ? 'This kind of link can only be opened, not downloaded.'
                  : 'Students get a Download button.'
              }
              checked={allowDownload && (!link || canDownload)}
              disabled={Boolean(link) && !canDownload}
              onCheckedChange={setAllowDownload}
            />
            <SwitchRow
              className="px-4 py-3"
              label="Visible to students"
              description="Turn off to prepare it now and share later."
              checked={published}
              onCheckedChange={setPublished}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-ink-100 px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {editing ? 'Save changes' : published ? 'Share with students' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
