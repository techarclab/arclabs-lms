'use client';

import { Download, ExternalLink, X } from 'lucide-react';
import type { MaterialLinkInfo, MaterialType } from '@arc/types';
import { Button, DialogPrimitive as D } from '@arc/ui';
import { MaterialFrame, TYPE_META, TypeIcon } from './shared';

export interface ViewerItem {
  title: string;
  description: string | null;
  type: MaterialType;
  link: MaterialLinkInfo;
  allowDownload: boolean;
  subtitle?: string | null;
}

/** Full-width viewer: the material inside the portal, with Open and Download buttons. */
export function MaterialViewer({
  item,
  onClose,
  onDownload,
  onOpenTab,
}: {
  item: ViewerItem | null;
  onClose: () => void;
  onDownload?: () => void;
  onOpenTab?: () => void;
}) {
  const canDownload = Boolean(item?.allowDownload && item.link.downloadUrl);
  return (
    <D.Root open={Boolean(item)} onOpenChange={(v) => !v && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink-950/60 backdrop-blur-[2px]" />
        <D.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[96vh] w-[calc(100vw-1.5rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-2xl outline-none">
          {item && (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-5 py-3.5">
                <TypeIcon type={item.type} className="size-9" />
                <div className="min-w-0 flex-1">
                  <D.Title className="truncate font-semibold text-ink-900">{item.title}</D.Title>
                  <D.Description className="truncate text-[13px] text-ink-500">
                    {item.subtitle ?? TYPE_META[item.type].label}
                  </D.Description>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <a href={item.link.openUrl} target="_blank" rel="noopener noreferrer" onClick={onOpenTab}>
                      <ExternalLink /> <span className="hidden sm:inline">Open in new tab</span>
                    </a>
                  </Button>
                  {canDownload && (
                    <Button asChild size="sm">
                      <a
                        href={item.link.downloadUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={onDownload}
                      >
                        <Download /> Download
                      </a>
                    </Button>
                  )}
                  <D.Close className="ml-1 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700">
                    <X className="size-5" />
                    <span className="sr-only">Close</span>
                  </D.Close>
                </div>
              </div>
              <div className="overflow-y-auto p-4 sm:p-5">
                <MaterialFrame link={item.link} title={item.title} />
                {item.description && (
                  <p className="mt-4 text-sm whitespace-pre-line text-ink-700">{item.description}</p>
                )}
              </div>
            </>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
