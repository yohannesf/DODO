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
        'h-8 rounded-sm border border-border bg-panel px-2.5 text-sm text-ink',
        'placeholder:text-ink-faint',
        'transition-colors duration-150 ease-out',
        'focus:border-primary focus:ring-2 focus:ring-primary/45 focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
});
