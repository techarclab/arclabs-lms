'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Eye, Library, Search, Sparkles } from 'lucide-react';
import type { MaterialLibrary, MaterialStudentItem } from '@arc/types';
import { Badge, Button, Card, cn, EmptyState, Input, Skeleton } from '@arc/ui';
import { MaterialViewer, type ViewerItem } from '@/components/materials/MaterialViewer';
import { folderPath, folderTree, TYPE_META, TypeIcon } from '@/components/materials/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatDate } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/use-api';

const NEW_DAYS = 7;

export default function MyMaterialsPage() {
  const mutate = useApiMutation();
  const {
    data,
    isLoading,
    mutate: setData,
  } = useApi<MaterialLibrary<MaterialStudentItem>>('/my/materials', { refreshInterval: 60_000 });
  const folders = data?.folders ?? [];
  const materials = data?.materials ?? [];
  const [subject, setSubject] = useState<string>(''); // '' = all
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<(ViewerItem & { id: string }) | null>(null);

  const tree = folderTree(folders);
  const subjectOf = (m: MaterialStudentItem) => {
    const f = folders.find((x) => x.id === m.folderId);
    return f ? (f.parentId ?? f.id) : null;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (subject === 'none' && m.folderId) return false;
      if (subject && subject !== 'none' && subjectOf(m) !== subject) return false;
      if (!q) return true;
      return `${m.title} ${m.description ?? ''} ${folderPath(folders, m.folderId) ?? ''} ${TYPE_META[m.type].label}`
        .toLowerCase()
        .includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, folders, subject, search]);

  // Group: subject → unit (units in folder order), loose items last.
  const groups = useMemo(() => {
    const out: { key: string; title: string; subtitle?: string; items: MaterialStudentItem[] }[] =
      [];
    for (const s of tree) {
      const direct = filtered.filter((m) => m.folderId === s.id);
      if (direct.length) out.push({ key: s.id, title: s.name, items: direct });
      for (const u of s.units) {
        const items = filtered.filter((m) => m.folderId === u.id);
        if (items.length) out.push({ key: u.id, title: u.name, subtitle: s.name, items });
      }
    }
    const loose = filtered.filter((m) => !m.folderId || !folders.some((f) => f.id === m.folderId));
    if (loose.length)
      out.push({
        key: 'none',
        title: tree.length ? 'Other materials' : 'All materials',
        items: loose,
      });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, folders]);

  function track(m: MaterialStudentItem, action: 'view' | 'download') {
    // Don't wait: opening the file must not be blocked by the network.
    void mutate(`/my/materials/${m.id}/open`, 'POST', { action }).catch(() => {});
    void setData(
      (d) =>
        d && {
          ...d,
          materials: d.materials.map((x) =>
            x.id === m.id
              ? {
                  ...x,
                  viewed: x.viewed || action === 'view',
                  downloaded: x.downloaded || action === 'download',
                }
              : x,
          ),
        },
      { revalidate: false },
    );
  }

  function view(m: MaterialStudentItem) {
    track(m, 'view');
    if (m.link.embedUrl)
      setViewing({ ...m, subtitle: folderPath(folders, m.folderId) ?? m.organizationName });
    else window.open(m.link.openUrl, '_blank', 'noopener,noreferrer');
  }

  const newCount = materials.filter((m) => isNew(m)).length;
  const hasLoose = materials.some((m) => !m.folderId);

  return (
    <>
      <PageHeader
        title="Study materials"
        description="Notes, slides, videos and links shared by your college."
      />

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}

      {data && materials.length === 0 && (
        <Card>
          <EmptyState
            icon={<Library />}
            title="No materials yet"
            description="When your faculty share notes, slides or videos, they will appear here."
          />
        </Card>
      )}

      {materials.length > 0 && (
        <>
          <div className="mb-6 space-y-4">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes, slides, videos…"
                className="pl-9"
              />
            </div>
            {(tree.length > 0 || newCount > 0) && (
              <div className="flex flex-wrap gap-2">
                <Chip active={subject === ''} onClick={() => setSubject('')}>
                  All <span className="opacity-60">{materials.length}</span>
                </Chip>
                {tree.map((s) => (
                  <Chip key={s.id} active={subject === s.id} onClick={() => setSubject(s.id)}>
                    {s.name}{' '}
                    <span className="opacity-60">
                      {materials.filter((m) => subjectOf(m) === s.id).length}
                    </span>
                  </Chip>
                ))}
                {hasLoose && tree.length > 0 && (
                  <Chip active={subject === 'none'} onClick={() => setSubject('none')}>
                    Other
                  </Chip>
                )}
              </div>
            )}
          </div>

          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-500">Nothing matches your search.</p>
          )}

          <div className="space-y-9">
            {groups.map((g) => (
              <section key={g.key}>
                <div className="mb-3 flex items-baseline gap-2">
                  {g.subtitle && <span className="text-sm text-ink-400">{g.subtitle} ›</span>}
                  <h2 className="text-[15px] font-semibold text-ink-900">{g.title}</h2>
                  <span className="text-xs text-ink-400">{g.items.length}</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((m) => (
                    <MaterialCard
                      key={m.id}
                      m={m}
                      onView={() => view(m)}
                      onDownload={() => track(m, 'download')}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      <MaterialViewer
        item={viewing}
        onClose={() => setViewing(null)}
        onDownload={() => {
          const m = materials.find((x) => x.id === viewing?.id);
          if (m) track(m, 'download');
        }}
      />
    </>
  );
}

function isNew(m: MaterialStudentItem) {
  return !m.viewed && Date.now() - new Date(m.createdAt).getTime() < NEW_DAYS * 86_400_000;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
      )}
    >
      {children}
    </button>
  );
}

function MaterialCard({
  m,
  onView,
  onDownload,
}: {
  m: MaterialStudentItem;
  onView: () => void;
  onDownload: () => void;
}) {
  const canDownload = Boolean(m.allowDownload && m.link.downloadUrl);
  return (
    <Card className="group flex flex-col p-5 transition hover:border-ink-300 hover:shadow-md hover:shadow-ink-900/[0.04]">
      <div className="flex items-start gap-3.5">
        <button onClick={onView} className="shrink-0" aria-label={`Open ${m.title}`}>
          <TypeIcon type={m.type} />
        </button>
        <div className="min-w-0 flex-1">
          <button
            onClick={onView}
            className="line-clamp-2 text-left font-semibold text-ink-900 transition group-hover:text-brand-700"
          >
            {m.title}
          </button>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            {TYPE_META[m.type].label} · {formatDate(m.createdAt)}
          </p>
        </div>
        {isNew(m) ? (
          <Badge tone="success">
            <Sparkles className="size-3" /> New
          </Badge>
        ) : m.viewed ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Opened" />
        ) : null}
      </div>
      {m.description && (
        <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-600">
          {m.description}
        </p>
      )}
      <div className="mt-auto flex gap-2 pt-4">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onView}>
          {m.link.embedUrl ? <Eye /> : <ExternalLink />}
          {m.type === 'video' ? 'Watch' : m.link.embedUrl ? 'View' : 'Open'}
        </Button>
        {canDownload && (
          <Button asChild size="sm" className="flex-1">
            <a
              href={m.link.downloadUrl!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onDownload}
            >
              <Download /> Download
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}
