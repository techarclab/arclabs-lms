import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

const fieldBase =
  'w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 shadow-xs transition placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:bg-ink-50 disabled:text-ink-500 aria-invalid:border-rose-400 aria-invalid:focus:ring-rose-500/15';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leading, trailing, ...props },
  ref,
) {
  if (!leading && !trailing) {
    return <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />;
  }
  return (
    <div className="relative flex items-center">
      {leading && (
        <span className="pointer-events-none absolute left-3 flex items-center text-ink-400 [&_svg]:size-4">
          {leading}
        </span>
      )}
      <input
        ref={ref}
        className={cn(fieldBase, 'h-10', leading && 'pl-9', trailing && 'pr-10', className)}
        {...props}
      />
      {trailing && <span className="absolute right-2 flex items-center">{trailing}</span>}
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, 'min-h-24 py-2', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(fieldBase, 'h-10 appearance-none pr-9', className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-400" />
      </div>
    );
  },
);

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-ink-800', className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  optional,
  required,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
  optional?: boolean;
  /** Shows a red asterisk after the label. */
  required?: boolean;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ml-0.5 text-rose-500" aria-hidden>
            *
          </span>
        )}
        {optional && <span className="ml-1.5 font-normal text-ink-400">Optional</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[13px] text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}
