import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useAuth } from '../auth/store';
import { SyncChip } from './SyncChip';

// Information architecture per spec §8.2.
const NAV = [
  { to: '/enter', label: 'Enter Data' },
  { to: '/review', label: 'Review & Approve' },
  { to: '/dashboards', label: 'Dashboards' },
  { to: '/maps', label: 'Maps' },
  { to: '/explore', label: 'Explore' },
  { to: '/framework', label: 'Framework' },
  { to: '/configure', label: 'Configure' },
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
            data online, data offline
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
            sign out
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
                  {item.label}
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
