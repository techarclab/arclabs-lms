'use client';

import { BookOpen, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@arc/ui';
import { useAuth } from '@/components/providers/AuthProvider';

export function UserMenu() {
  const router = useRouter();
  const { me, signOut } = useAuth();
  if (!me) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full ring-offset-2 transition outline-none hover:ring-2 hover:ring-ink-200 focus-visible:ring-2 focus-visible:ring-brand-500">
        <Avatar name={me.fullName} size="sm" round />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <div className="flex items-center gap-3 px-2.5 py-2.5">
          <Avatar name={me.fullName} size="md" round />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{me.fullName}</p>
            <p className="truncate text-xs text-ink-500">{me.email}</p>
          </div>
        </div>
        {me.isSuperAdmin && (
          <div className="mx-2.5 mb-2 flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700">
            <ShieldCheck className="size-3.5" /> Super Admin
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<UserRound />} disabled>
          Profile <span className="ml-auto text-[10px] text-ink-400 uppercase">Soon</span>
        </DropdownMenuItem>
        {process.env.NODE_ENV !== 'production' && (
          <DropdownMenuItem
            icon={<BookOpen />}
            onSelect={() =>
              window.open(
                (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1').replace(
                  /\/v1\/?$/,
                  '/docs',
                ),
                '_blank',
              )
            }
          >
            API docs
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          danger
          icon={<LogOut />}
          onSelect={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
