// Persistent compact sync chip (spec §8.4): state + tap → Sync Center.
// Status is typographic — small-caps with a leading glyph.
import { Link } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import { useSyncStatus } from '../sync/engine';

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function SyncChip() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const { status, pending, failed, conflicts } = useSyncStatus();

  let text: string;
  if (!online) {
    text = pending > 0 ? `◌ offline — ${pending} pending` : '◌ offline';
  } else if (status === 'syncing') {
    text = '◌ syncing…';
  } else if (conflicts > 0) {
    text = `▲ ${conflicts} conflict${conflicts > 1 ? 's' : ''}`;
  } else if (failed > 0) {
    text = `▲ ${failed} failed`;
  } else if (pending > 0) {
    text = `◌ ${pending} pending`;
  } else {
    text = '● synced';
  }

  return (
    <Link
      to="/sync"
      data-testid="sync-chip"
      className="small-caps font-medium text-ink-muted hover:text-cobalt"
    >
      {text}
    </Link>
  );
}
