// Dense, keyboard-first tables (design language): sticky header, hairline
// rules, zebra OFF, right-aligned tabular numerals via `numeric`.
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx } from './cx';

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cx('w-full border-collapse text-left text-sm', className)}
      {...rest}
    />
  );
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cx('sticky top-0 bg-paper', className)} {...rest} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function Tr({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cx('border-b border-hairline transition-colors', className)}
      {...rest}
    />
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
        'small-caps border-b border-ink px-2 py-1.5 font-medium text-ink-muted',
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
      className={cx('px-2 py-1.5', numeric && 'tnum text-right', className)}
      {...rest}
    />
  );
}
