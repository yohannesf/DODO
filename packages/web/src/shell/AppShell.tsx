import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useAuth } from '../auth/store';
import { t } from '../i18n';
import { SyncGauge } from './SyncGauge';

// Information architecture per spec §8.2.
const NAV = [
  { to: '/enter', key: 'nav.enterData' },
  { to: '/review', key: 'nav.review' },
  { to: '/dashboards', key: 'nav.dashboards' },
  { to: '/maps', key: 'nav.maps' },
  { to: '/explore', key: 'nav.explore' },
  { to: '/framework', key: 'nav.framework' },
  { to: '/configure', key: 'nav.configure' },
] as const;

export function AppShell() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="grid min-h-dvh grid-rows-[48px_1fr]">
      {/* persistent context bar (§4): brand + Sync Gauge */}
      <header className="flex items-center justify-between border-b border-border-strong bg-panel px-4">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-extrabold tracking-tight">DODO</span>
          <span className="type-label hidden text-ink-faint sm:inline">
            {t('app.tagline')}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <SyncGauge />
          <span className="text-[12px] text-ink-muted">{user?.displayName}</span>
          <button
            type="button"
            className="type-label cursor-pointer text-ink-muted hover:text-primary"
            onClick={() => {
              void logout().then(() => navigate({ to: '/login' }));
            }}
          >
            {t('nav.signOut')}
          </button>
        </div>
      </header>
      <div className="grid min-h-0 grid-cols-[240px_1fr]">
        <nav aria-label="Primary" className="border-r border-border bg-panel py-2">
          <ul>
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="block border-l-2 border-transparent px-4 py-1.5 text-sm text-ink-muted transition-colors duration-150 ease-out hover:bg-panel-raised hover:text-ink"
                  activeProps={{
                    className:
                      'block border-l-2 border-primary bg-primary-tint px-4 py-1.5 text-sm font-medium text-primary',
                  }}
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 overflow-x-auto bg-canvas px-6 py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
