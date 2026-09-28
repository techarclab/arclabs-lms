'use client';

import { Check, ChevronsUpDown, Globe2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@arc/ui';
import { useOrg } from '@/components/providers/OrgProvider';
import { ORG_TYPE_LABEL, ROLE_LABEL } from '@/lib/format';

export function OrgSwitcher() {
  const router = useRouter();
  const { current, options, select, isSuperAdmin } = useOrg();

  if (!isSuperAdmin && options.length === 0) {
    return <span className="text-sm text-ink-500">No organization</span>;
  }

  const subtitle = current
    ? isSuperAdmin
      ? (ORG_TYPE_LABEL[current.type ?? ''] ?? 'Organization')
      : current.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')
    : 'All organizations';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex max-w-[280px] items-center gap-2.5 rounded-xl border border-ink-200 bg-white py-1.5 pr-2.5 pl-1.5 text-left shadow-xs transition hover:border-ink-300 hover:bg-ink-50 data-[state=open]:border-brand-300 data-[state=open]:ring-3 data-[state=open]:ring-brand-500/10">
        {current ? (
          <Avatar name={current.name} color={current.primaryColor} size="sm" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-cyan-500 text-white">
            <Globe2 className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink-900">
            {current ? current.name : 'Platform'}
          </span>
          <span className="block truncate text-[11.5px] text-ink-500">{subtitle}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-ink-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {isSuperAdmin && (
          <>
            <DropdownMenuItem onSelect={() => select(null)} icon={<Globe2 />}>
              <span className="flex-1">Platform view</span>
              {!current && <Check className="!text-brand-600" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <div className="max-h-72 overflow-y-auto">
          {options.map((o) => (
            <DropdownMenuItem key={o.id} onSelect={() => select(o.id)}>
              <Avatar name={o.name} color={o.primaryColor} size="xs" />
              <span className="flex-1 truncate">{o.name}</span>
              {current?.id === o.id && <Check className="!text-brand-600" />}
            </DropdownMenuItem>
          ))}
        </div>
        {isSuperAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<Plus />} onSelect={() => router.push('/organizations?new=1')}>
              New organization
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
