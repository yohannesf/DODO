import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cx(
        'w-full rounded-sm border border-border bg-panel px-2.5 py-1.5 font-mono text-[13px] text-ink',
        'placeholder:text-ink-faint',
        'focus:border-primary focus:ring-2 focus:ring-primary/45 focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
});
