import { Link, Outlet } from '@tanstack/react-router';
import { ConnectivityChip } from './ConnectivityChip';
import { UpdateToast } from './UpdateToast';

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
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr]">
      <header className="flex items-center justify-between border-b border-ink px-4 py-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-base font-medium tracking-tight">DODO</span>
          <span className="small-caps hidden text-ink-muted sm:inline">
            data online, data offline
          </span>
        </div>
        <ConnectivityChip />
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
      <UpdateToast />
    </div>
  );
}
