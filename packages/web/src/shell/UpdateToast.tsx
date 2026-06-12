// SW update flow (spec §5.5): when a new service worker is waiting, offer a
// reload — never auto-reload during data entry.
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../components';

export function UpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-sm border border-ink bg-surface px-3 py-2 text-sm"
    >
      Update available
      <Button size="sm" variant="primary" onClick={() => updateServiceWorker(true)}>
        Reload
      </Button>
    </div>
  );
}
