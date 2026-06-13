// Dense, keyboard-first tables (design language §6): sticky header on
// --sunken, label-caps column headers, 1px row rules, right-aligned mono
// numerals, row hover --primary-tint (low alpha), zebra OFF.
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx } from './cx';

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cx(
        'w-full border-collapse text-left text-sm',
        '[&_tbody_tr:hover]:bg-primary-tint/50',
        className,
      )}
      {...rest}
    />
  );
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cx('sticky top-0 bg-sunken', className)} {...rest} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function Tr({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cx('border-b border-border transition-colors', className)} {...rest} />
  );
}

export interface CellProps {
  numeric?: boolean;
}

export function Th({
  numeric,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <th
      className={cx(
        'type-label border-b border-border-strong px-2 py-[var(--row-py)] text-ink-muted',
        numeric && 'text-right',
        className,
      )}
      {...rest}
    />
  );
}

export function Td({
  numeric,
  className,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <td
      className={cx(
        'px-2 py-[var(--row-py)]',
        numeric && 'tnum text-right font-mono',
        className,
      )}
      {...rest}
    />
  );
}
