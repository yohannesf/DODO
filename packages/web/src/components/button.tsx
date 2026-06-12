import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-cobalt text-paper border border-cobalt hover:bg-cobalt-deep hover:border-cobalt-deep',
  secondary: 'bg-surface text-ink border border-hairline hover:border-ink-muted',
  ghost: 'bg-transparent text-cobalt border border-transparent hover:text-cobalt-deep',
};

const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-7 px-2.5 text-[13px]',
  md: 'h-8 px-3.5 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', type = 'button', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-xs font-medium',
        'transition-colors duration-150 ease-out disabled:cursor-default disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  );
});
