// Online/offline is a status, not a mode (spec §5.1): show it passively and
// continuously. Status is typographic — small-caps text with a leading glyph.
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function ConnectivityChip() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  return (
    <span
      data-testid="connectivity-chip"
      className="small-caps font-medium text-ink-muted"
    >
      {online ? '● online' : '◌ offline'}
    </span>
  );
}
