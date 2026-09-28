import { cn } from '@arc/ui';

/** ARC LABS mark: an arc over a node — "connect hardware". */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <defs>
        <linearGradient id="arc-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6883ff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#161a4f" />
      <path
        d="M8 22a8 8 0 0 1 16 0"
        fill="none"
        stroke="url(#arc-g)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="22" r="2.6" fill="#fff" />
      <circle cx="16" cy="10.5" r="1.6" fill="#22d3ee" />
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="leading-none">
        <span
          className={cn(
            'block text-[15px] font-semibold tracking-tight',
            inverted ? 'text-white' : 'text-ink-900',
          )}
        >
          ARC LABS
        </span>
        <span
          className={cn(
            'block text-[11px] font-medium tracking-wide',
            inverted ? 'text-white/50' : 'text-ink-400',
          )}
        >
          Learning Platform
        </span>
      </span>
    </span>
  );
}
