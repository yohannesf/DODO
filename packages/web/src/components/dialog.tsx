import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cx } from './cx';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function DialogContent({
  title,
  description,
  children,
  className,
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 bg-ink/40 duration-150 ease-out data-[state=open]:animate-[fade-in_150ms]" />
      <RadixDialog.Content
        className={cx(
          'fixed top-1/2 left-1/2 w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-ink bg-surface p-5',
          'duration-150 ease-out data-[state=open]:animate-[fade-in_150ms]',
          className,
        )}
      >
        <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
        {description ? (
          <RadixDialog.Description className="mt-1 text-sm text-ink-muted">
            {description}
          </RadixDialog.Description>
        ) : null}
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
