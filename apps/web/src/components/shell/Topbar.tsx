'use client';

import { Bell, Menu, Search } from 'lucide-react';
import { OrgSwitcher } from './OrgSwitcher';
import { UserMenu } from './UserMenu';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200/70 bg-white/80 px-4 backdrop-blur-xl sm:px-6">
      <button
        className="-ml-1 rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      <OrgSwitcher />

      <div className="ml-auto flex items-center gap-2">
        <button className="hidden h-9 w-72 items-center gap-2.5 rounded-lg border border-ink-200 bg-ink-50/70 px-3 text-sm text-ink-400 transition hover:border-ink-300 md:flex">
          <Search className="size-4" />
          <span className="flex-1 text-left">Search courses, people…</span>
          <kbd className="rounded-md border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
            Ctrl K
          </kbd>
        </button>
        <button
          className="relative rounded-lg p-2 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
          aria-label="Notifications"
        >
          <Bell className="size-5" strokeWidth={1.8} />
          <span className="absolute top-2 right-2 size-2 rounded-full bg-brand-500 ring-2 ring-white" />
        </button>
        <div className="mx-1 h-6 w-px bg-ink-200" />
        <UserMenu />
      </div>
    </header>
  );
}
