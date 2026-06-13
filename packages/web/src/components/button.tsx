import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'border border-primary bg-primary text-on-primary hover:border-primary-hover hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-panel text-ink hover:border-ink-muted',
  ghost:
    'border border-transparent bg-transparent text-primary hover:bg-panel-raised hover:text-primary-hover',
  danger:
    'border border-danger bg-transparent text-danger hover:bg-danger hover:text-on-primary',
};

const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-2.5 text-[13px]', // compact (32px)
  md: 'h-9 px-3.5 text-sm', // default (36px)
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
        'inline-flex cursor-pointer items-center gap-1.5 rounded-sm font-medium',
        'transition-colors duration-150 ease-out disabled:cursor-default disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  );
});
