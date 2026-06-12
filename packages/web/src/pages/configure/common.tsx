import type { ReactNode } from 'react';
import { ApiError } from '../../api/client';

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiError
      ? `${error.message}${
          error.issues?.length
            ? ' — ' + error.issues.map((i) => `${i.path}: ${i.message}`).join('; ')
            : ''
        }`
      : error instanceof Error
        ? error.message
        : String(error);
  return (
    <p role="alert" className="mt-2 text-[12px] text-offtrack">
      ▲ {message}
    </p>
  );
}

export function SectionTitle({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-semibold">{title}</h2>
      {actions}
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="py-6 text-sm text-ink-muted">{children}</p>;
}
