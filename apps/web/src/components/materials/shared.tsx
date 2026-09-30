'use client';

import {
  Code2,
  ExternalLink,
  File,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  Link2,
  Presentation,
  PlayCircle,
  type LucideIcon,
} from 'lucide-react';
import type {
  MaterialFolderItem,
  MaterialLinkInfo,
  MaterialProvider,
  MaterialType,
} from '@arc/types';
import { cn } from '@arc/ui';

export const TYPE_META: Record<MaterialType, { label: string; icon: LucideIcon; tone: string }> = {
  pdf: { label: 'PDF', icon: FileText, tone: 'bg-rose-50 text-rose-600 ring-rose-100' },
  slides: {
    label: 'Slides',
    icon: Presentation,
    tone: 'bg-orange-50 text-orange-600 ring-orange-100',
  },
  doc: { label: 'Document', icon: File, tone: 'bg-sky-50 text-sky-600 ring-sky-100' },
  sheet: {
    label: 'Spreadsheet',
    icon: FileSpreadsheet,
    tone: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  },
  video: { label: 'Video', icon: PlayCircle, tone: 'bg-red-50 text-red-600 ring-red-100' },
  image: { label: 'Image', icon: ImageIcon, tone: 'bg-violet-50 text-violet-600 ring-violet-100' },
  code: { label: 'Code', icon: Code2, tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  zip: { label: 'ZIP', icon: FileArchive, tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
  folder: { label: 'Folder', icon: Folder, tone: 'bg-yellow-50 text-yellow-700 ring-yellow-100' },
  link: { label: 'Link', icon: Link2, tone: 'bg-brand-50 text-brand-600 ring-brand-100' },
};

export const PROVIDER_LABEL: Record<MaterialProvider, string> = {
  youtube: 'YouTube',
  'google-drive': 'Google Drive',
  'google-docs': 'Google Docs',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  web: 'Website',
  upload: 'Uploaded file',
};

export function TypeIcon({ type, className }: { type: MaterialType; className?: string }) {
  const m = TYPE_META[type];
  const Icon = m.icon;
  return (
    <div
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 [&_svg]:size-5',
        m.tone,
        className,
      )}
    >
      <Icon />
    </div>
  );
}

/** "Embedded Systems › Unit 1" */
export function folderPath(folders: MaterialFolderItem[], id: string | null): string | null {
  if (!id) return null;
  const f = folders.find((x) => x.id === id);
  if (!f) return null;
  const p = f.parentId ? folders.find((x) => x.id === f.parentId) : null;
  return p ? `${p.name} › ${f.name}` : f.name;
}

/** Subjects with their units, in display order. */
export function folderTree(folders: MaterialFolderItem[]) {
  const top = folders.filter((f) => !f.parentId);
  return top.map((s) => ({ ...s, units: folders.filter((f) => f.parentId === s.id) }));
}

/** Big preview of a material inside the portal (YouTube, Drive, Docs, PDFs, Office files). */
export function MaterialFrame({ link, title }: { link: MaterialLinkInfo; title: string }) {
  if (!link.embedUrl) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-ink-50 text-center ring-1 ring-ink-200">
        <ExternalLink className="size-6 text-ink-400" />
        <p className="max-w-xs text-sm text-ink-600">
          This link can’t be shown inside the portal. Open it in a new tab.
        </p>
      </div>
    );
  }
  if (link.type === 'image' && (link.provider === 'web' || link.provider === 'upload')) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={link.embedUrl}
        alt={title}
        className="max-h-[72vh] w-full rounded-xl object-contain"
      />
    );
  }
  if (link.type === 'video' && (link.provider === 'web' || link.provider === 'upload')) {
    return (
      <video src={link.embedUrl} controls className="max-h-[72vh] w-full rounded-xl bg-black" />
    );
  }
  return (
    <iframe
      src={link.embedUrl}
      title={title}
      className={cn(
        'w-full rounded-xl bg-ink-50 ring-1 ring-ink-200',
        link.type === 'video' ? 'aspect-video' : 'h-[72vh]',
      )}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
