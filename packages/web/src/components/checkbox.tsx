import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from './cx';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, ...rest },
  ref,
) {
  return (
    <label
      className={cx(
        'inline-flex cursor-pointer items-center gap-2 text-sm text-ink',
        className,
      )}
    >
      <input ref={ref} type="checkbox" className="accent-primary" {...rest} />
      {label}
    </label>
  );
});
