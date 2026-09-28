'use client';

import { useEffect, useState } from 'react';
import { Building2, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { OrganizationSummary, OrgType } from '@arc/types';
import { createOrganizationSchema, slugify } from '@arc/validation';
import { Button, cn, Dialog, DialogContent, Field, Input } from '@arc/ui';
import { ApiError } from '@/lib/api';
import { useApiMutation } from '@/lib/use-api';

const TYPES: { value: OrgType; label: string; hint: string }[] = [
  { value: 'COLLEGE', label: 'College', hint: 'Engineering & degree colleges' },
  { value: 'SCHOOL', label: 'School', hint: 'K-12 schools & STEM labs' },
  { value: 'COMPANY', label: 'Company', hint: 'Corporate training' },
  { value: 'OTHER', label: 'Other', hint: 'NGOs, communities, …' },
];

export const BRAND_SWATCHES = [
  '#2F45EF',
  '#7C3AED',
  '#0891B2',
  '#059669',
  '#D97706',
  '#E11D48',
  '#0F172A',
  '#DB2777',
];

type Errors = Partial<Record<'name' | 'slug' | 'contactEmail' | 'primaryColor', string>>;

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (org: OrganizationSummary) => void;
}) {
  const mutate = useApiMutation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState<OrgType>('COLLEGE');
  const [contactEmail, setContactEmail] = useState('');
  const [color, setColor] = useState(BRAND_SWATCHES[0]!);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    if (!open) {
      setName('');
      setSlug('');
      setSlugTouched(false);
      setType('COLLEGE');
      setContactEmail('');
      setColor(BRAND_SWATCHES[0]!);
      setErrors({});
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { name, slug, type, contactEmail, primaryColor: color };
    const parsed = createOrganizationSchema.safeParse(input);
    if (!parsed.success) {
      const next: Errors = {};
      for (const i of parsed.error.issues) next[i.path[0] as keyof Errors] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const org = await mutate<OrganizationSummary>('/organizations', 'POST', parsed.data);
      toast.success(`${org.name} created`, { description: 'The organization workspace is ready.' });
      onCreated(org);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409)
        setErrors({ slug: 'This URL is already taken' });
      else toast.error('Could not create organization', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New organization"
        description="Add an institution or company that ARC LABS trains."
        icon={<Building2 />}
        className="max-w-xl"
      >
        <form onSubmit={submit} noValidate>
          <div className="space-y-5 px-6 pt-4 pb-6">
            <Field label="Organization name" htmlFor="org-name" error={errors.name}>
              <Input
                id="org-name"
                autoFocus
                placeholder="e.g. Malla Reddy Engineering College"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={Boolean(errors.name)}
              />
            </Field>

            <Field
              label="Workspace URL"
              htmlFor="org-slug"
              error={errors.slug}
              hint="Lowercase letters, numbers and hyphens."
            >
              <div className="flex rounded-lg shadow-xs">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-ink-200 bg-ink-50 px-3 text-sm text-ink-500">
                  learn.arclabs.in/
                </span>
                <Input
                  id="org-slug"
                  className="rounded-l-none shadow-none"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  aria-invalid={Boolean(errors.slug)}
                />
              </div>
            </Field>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink-800">Type</p>
              <div className="grid grid-cols-2 gap-2.5">
                {TYPES.map((t) => (
                  <button
                    type="button"
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={cn(
                      'relative rounded-xl border px-3.5 py-3 text-left transition',
                      type === t.value
                        ? 'border-brand-500 bg-brand-50/60 ring-3 ring-brand-500/10'
                        : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50',
                    )}
                  >
                    <p className="text-sm font-medium text-ink-900">{t.label}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{t.hint}</p>
                    {type === t.value && (
                      <span className="absolute top-3 right-3 flex size-4 items-center justify-center rounded-full bg-brand-600 text-white">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Contact email" htmlFor="org-email" error={errors.contactEmail} optional>
                <Input
                  id="org-email"
                  type="email"
                  placeholder="training@college.edu"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  aria-invalid={Boolean(errors.contactEmail)}
                />
              </Field>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-ink-800">Brand colour</p>
                <div className="flex h-10 items-center gap-2">
                  {BRAND_SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn(
                        'size-6 rounded-full ring-offset-2 transition',
                        color === c ? 'ring-2 ring-ink-900' : 'hover:scale-110',
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create organization
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
