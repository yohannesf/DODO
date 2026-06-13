import type { ReactNode } from 'react';

export interface PageProps {
  title: string;
  children: ReactNode;
}

// Page header: the nav already names the page, so the old oversized section
// numeral is gone (design language §3). Empty states still teach.
export function Page({ title, children }: PageProps) {
  return (
    <section className="max-w-2xl">
      <h1 className="type-h1">{title}</h1>
      <div className="mt-3 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}
