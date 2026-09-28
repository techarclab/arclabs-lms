import { cn } from './cn';

const PALETTE = [
  'bg-brand-600',
  'bg-violet-600',
  'bg-sky-600',
  'bg-emerald-600',
  'bg-amber-500',
  'bg-rose-600',
  'bg-cyan-600',
  'bg-fuchsia-600',
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? parts[parts.length - 1]![0] : (parts[0]?.[1] ?? '');
  return (first + second).toUpperCase();
}

const sizes = {
  xs: 'size-6 text-[10px] rounded-md',
  sm: 'size-8 text-xs rounded-lg',
  md: 'size-10 text-sm rounded-xl',
  lg: 'size-14 text-lg rounded-2xl',
};

/** Initials avatar with a stable colour per name (or an explicit brand colour). */
export function Avatar({
  name,
  color,
  size = 'sm',
  round,
  className,
}: {
  name: string;
  color?: string | null;
  size?: keyof typeof sizes;
  round?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold text-white select-none',
        sizes[size],
        round && 'rounded-full',
        !color && PALETTE[hash(name) % PALETTE.length],
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
