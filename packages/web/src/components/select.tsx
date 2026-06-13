import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cx } from './cx';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(
        'h-8 w-full rounded-sm border border-border bg-panel px-2 text-sm text-ink',
        'transition-colors duration-150 ease-out',
        'focus:border-primary focus:ring-2 focus:ring-primary/45 focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
});
