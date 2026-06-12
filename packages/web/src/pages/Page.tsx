import type { ReactNode } from 'react';

export interface PageProps {
  number: string;
  title: string;
  children: ReactNode;
}

// Empty states teach (design language): every M0 page says what unlocks it.
export function Page({ number, title, children }: PageProps) {
  return (
    <section className="max-w-2xl">
      <p className="tnum text-3xl font-semibold text-ink-muted">{number}</p>
      <h1 className="mt-1 text-xl font-semibold">{title}</h1>
      <div className="mt-3 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}
