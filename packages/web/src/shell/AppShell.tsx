import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useAuth } from '../auth/store';
import { t } from '../i18n';
import { SyncChip } from './SyncChip';

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
    <div className="grid min-h-dvh grid-rows-[auto_1fr]">
      <header className="flex items-center justify-between border-b border-ink px-4 py-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-base font-medium tracking-tight">DODO</span>
          <span className="small-caps hidden text-ink-muted sm:inline">
            {t('app.tagline')}
          </span>
        </div>
        <div className="flex items-baseline gap-4">
          <SyncChip />
          <span className="text-[12px] text-ink-muted">{user?.displayName}</span>
          <button
            type="button"
            className="small-caps cursor-pointer text-ink-muted hover:text-cobalt"
            onClick={() => {
              void logout().then(() => navigate({ to: '/login' }));
            }}
          >
            {t('nav.signOut')}
          </button>
        </div>
      </header>
      <div className="grid grid-cols-[176px_1fr]">
        <nav aria-label="Primary" className="border-r border-hairline py-3">
          <ul>
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="block border-l-2 border-transparent px-4 py-1.5 text-sm text-ink-muted transition-colors duration-150 ease-out hover:text-ink"
                  activeProps={{
                    className:
                      'block border-l-2 border-cobalt px-4 py-1.5 text-sm font-medium text-cobalt',
                  }}
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="px-6 py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
