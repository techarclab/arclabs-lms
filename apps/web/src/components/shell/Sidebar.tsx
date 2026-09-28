'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LifeBuoy, X } from 'lucide-react';
import { cn } from '@arc/ui';
import { Logo } from '@/components/brand/Logo';
import { useAuth } from '@/components/providers/AuthProvider';
import { useOrg } from '@/components/providers/OrgProvider';
import { visibleFooter, visibleSections, type NavItem } from './nav';

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
        active
          ? 'bg-white/[0.08] text-white'
          : 'text-ink-300 hover:bg-white/[0.04] hover:text-white',
      )}
    >
      {active && (
        <span className="absolute top-1/2 -left-3 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-400 to-cyan-400" />
      )}
      <Icon
        className={cn(
          'size-[18px] shrink-0 transition-colors',
          active ? 'text-brand-300' : 'text-ink-400 group-hover:text-ink-200',
        )}
        strokeWidth={1.8}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.soon && (
        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-ink-400 uppercase">
          Soon
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth();
  const { current, isSuperAdmin } = useOrg();
  const roles = current?.roles ?? [];
  const sections = visibleSections(isSuperAdmin, roles);
  const footer = visibleFooter(isSuperAdmin, roles);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-sm transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-ink-950 transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top_left,rgba(68,96,250,0.22),transparent_65%)]" />
        <div className="relative flex h-16 items-center justify-between px-5">
          <Link href="/dashboard" onClick={onClose}>
            <Logo inverted />
          </Link>
          <button
            className="rounded-lg p-1.5 text-ink-400 hover:bg-white/5 lg:hidden"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="relative flex-1 space-y-6 overflow-y-auto px-3 pt-4 pb-6">
          {sections.map((section, i) => (
            <div key={section.title ?? i}>
              {section.title && (
                <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.08em] text-ink-500 uppercase">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.href} item={item} onNavigate={onClose} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative space-y-0.5 border-t border-white/[0.06] px-3 py-3">
          {footer.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onClose} />
          ))}
          <a
            href="mailto:deepakarclab@outlook.com"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-300 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <LifeBuoy className="size-[18px] text-ink-400" strokeWidth={1.8} />
            Help & support
          </a>
          {me?.isSuperAdmin && (
            <div className="mx-1 mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-xs font-medium text-white">Super Admin</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-400">
                Full platform access. Actions are audit-logged.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
