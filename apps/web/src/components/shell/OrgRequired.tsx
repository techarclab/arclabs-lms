'use client';

import type { ReactNode } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { hasPermission, type OrgRole, type Permission } from '@arc/types';
import { Avatar, Card, EmptyState } from '@arc/ui';
import { useOrg, type OrgOption } from '@/components/providers/OrgProvider';
import { PageHeader } from '@/components/shell/PageHeader';
import { ORG_TYPE_LABEL } from '@/lib/format';

/**
 * Renders children only when an organization is selected and the user holds `permission` in it.
 * Super Admins in platform view get an organization picker.
 */
export function OrgRequired({
  title,
  description,
  permission,
  children,
}: {
  title: string;
  description: string;
  permission: Permission;
  children: (org: OrgOption) => ReactNode;
}) {
  const { current, options, select, isSuperAdmin } = useOrg();
  if (!current) {
    return (
      <>
        <PageHeader title={title} description={`Choose an organization. ${description}`} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => select(o.id)}
              className="group flex items-center gap-4 rounded-2xl border border-ink-200/80 bg-white p-5 text-left shadow-xs transition hover:border-brand-300 hover:shadow-md hover:shadow-ink-900/[0.04]"
            >
              <Avatar name={o.name} color={o.primaryColor} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-900">{o.name}</p>
                <p className="text-sm text-ink-500">
                  {ORG_TYPE_LABEL[o.type ?? ''] ?? 'Organization'}
                </p>
              </div>
              <ArrowRight className="size-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </button>
          ))}
        </div>
      </>
    );
  }
  if (!isSuperAdmin && !hasPermission(current.roles as OrgRole[], permission)) {
    return (
      <Card className="mx-auto mt-10 max-w-lg">
        <EmptyState
          icon={<Lock />}
          title={`You don’t have access to ${title}`}
          description="Ask your organization admin for access."
        />
      </Card>
    );
  }
  return <>{children(current)}</>;
}
