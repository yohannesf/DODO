import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from './cx';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(
        'h-8 rounded-xs border border-hairline bg-surface px-2.5 text-sm text-ink',
        'placeholder:text-ink-muted',
        'transition-colors duration-150 ease-out',
        'focus:border-cobalt focus:outline-none focus-visible:outline-none',
        'focus:ring-1 focus:ring-cobalt',
        className,
      )}
      {...rest}
    />
  );
});
