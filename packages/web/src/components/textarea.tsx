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
        'w-full rounded-xs border border-hairline bg-surface px-2.5 py-1.5 font-mono text-[13px] text-ink',
        'placeholder:text-ink-muted',
        'focus:border-cobalt focus:ring-1 focus:ring-cobalt focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
});
