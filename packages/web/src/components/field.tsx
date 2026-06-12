import type { ReactNode } from 'react';
import { cx } from './cx';

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  return (
    <label className={cx('block', className)}>
      <span className="small-caps mb-1 block font-medium text-ink-muted">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-offtrack">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * Like Field but for groups of interactive children (button sets, checkbox
 * lists) — a <label> wrapper would hijack their accessible names.
 */
export function FieldGroup({ label, hint, error, children, className }: FieldProps) {
  return (
    <div className={cx('block', className)}>
      <span className="small-caps mb-1 block font-medium text-ink-muted">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-offtrack">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-ink-muted">{hint}</span>
      ) : null}
    </div>
  );
}
