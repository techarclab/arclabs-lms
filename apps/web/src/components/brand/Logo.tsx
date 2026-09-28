/* eslint-disable @next/next/no-img-element -- small static brand assets from /public */
import { cn } from '@arc/ui';

/** ARC LABS mark (the "A" with the arc) on a dark tile — reads on light and dark backgrounds. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-[28%] bg-ink-950 ring-1 ring-white/10',
        className,
      )}
      aria-hidden
    >
      <img src="/brand/arclabs-mark-light.png" alt="" className="w-[72%]" draggable={false} />
    </span>
  );
}

/** Horizontal lockup: mark + "ARC LABS" wordmark + product line. */
export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="flex flex-col gap-1 leading-none">
        <img
          src={inverted ? '/brand/arclabs-wordmark-light.png' : '/brand/arclabs-wordmark-dark.png'}
          alt="ARC LABS"
          className="h-[11px] w-auto"
          draggable={false}
        />
        <span
          className={cn(
            'block text-[10.5px] font-medium tracking-wide',
            inverted ? 'text-white/50' : 'text-ink-400',
          )}
        >
          Learning Platform
        </span>
      </span>
    </span>
  );
}

/** Full brand lockup with the tagline — for hero areas. */
export function BrandLockup({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <img
      src={inverted ? '/brand/arclabs-logo-light.png' : '/brand/arclabs-logo-dark.png'}
      alt="ARC LABS — communicate · collaborate · create"
      className={cn('h-auto w-56', className)}
      draggable={false}
    />
  );
}
