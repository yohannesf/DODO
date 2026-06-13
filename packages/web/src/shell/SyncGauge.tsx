// Sync Gauge (design language §7) — the signature instrument in the context
// bar. Foregrounds the thing no other M&E tool shows: live connection + the
// outstanding offline work. The status line keeps the exact i18n text under
// `data-testid="sync-chip"` (the offline e2e suite asserts on it); the gauge
// adds the frame, semantic colour, a "synced N ago" meta line, and — the only
// animation in the app — a 1.2s pulse while syncing (disabled by
// prefers-reduced-motion via the global rule).
import { Link } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import { cx } from '../components';
import { t } from '../i18n';
import { useSyncStatus } from '../sync/engine';

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function ago(iso: string | null): string {
  if (!iso) return 'never synced';
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 45) return 'synced just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `synced ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `synced ${hrs}h ago`;
  return `synced ${Math.round(hrs / 24)}d ago`;
}

export function SyncGauge() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const { status, pending, failed, conflicts, lastSyncAt } = useSyncStatus();

  // status text — must match the strings the e2e asserts on (do not reword)
  let text: string;
  let tone: 'ok' | 'warn' | 'danger' | 'primary';
  if (!online) {
    text = pending > 0 ? t('sync.offlinePending', { n: pending }) : t('sync.offline');
    tone = 'warn'; // offline is itself an attention state
  } else if (status === 'syncing') {
    text = t('sync.syncing');
    tone = 'primary';
  } else if (conflicts > 0) {
    text = `▲ ${conflicts} conflict${conflicts > 1 ? 's' : ''}`;
    tone = 'danger';
  } else if (failed > 0) {
    text = t('sync.failed', { n: failed });
    tone = 'danger';
  } else if (pending > 0) {
    text = t('sync.pending', { n: pending });
    tone = 'warn';
  } else {
    text = t('sync.synced');
    tone = 'ok';
  }

  const toneClass = {
    ok: 'text-ok',
    warn: 'text-warn',
    danger: 'text-danger',
    primary: 'text-primary',
  }[tone];

  // secondary line: foreground unsynced/conflict count, else the last-sync time
  const meta =
    conflicts > 0
      ? `▣ ${conflicts} to resolve`
      : pending + failed > 0
        ? `▣ ${pending + failed} unsynced`
        : ago(lastSyncAt);
  const metaClass =
    conflicts > 0 || pending + failed > 0 ? 'text-warn' : 'text-ink-faint';

  return (
    <Link
      to="/sync"
      aria-label="Sync status — open Sync Center"
      className="flex flex-col justify-center gap-0.5 rounded-xs border border-border bg-panel px-2.5 py-1 leading-none hover:border-border-strong"
    >
      <span
        data-testid="sync-chip"
        className={cx(
          'type-label',
          toneClass,
          status === 'syncing' &&
            'animate-[sync-pulse_1.2s_ease-in-out_infinite] motion-reduce:animate-none',
        )}
      >
        {text}
      </span>
      <span className={cx('font-mono text-[10px] tracking-normal lowercase', metaClass)}>
        {meta}
      </span>
    </Link>
  );
}
