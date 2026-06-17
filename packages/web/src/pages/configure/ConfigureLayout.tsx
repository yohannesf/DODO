import { Link, Outlet } from '@tanstack/react-router';

const SECTIONS = [
  { to: '/configure', label: 'Overview', exact: true },
  { to: '/configure/programs', label: 'Programs' },
  { to: '/configure/org-units', label: 'Org units' },
  { to: '/configure/disaggregation', label: 'Disaggregation' },
  { to: '/configure/data-elements', label: 'Data elements' },
  { to: '/configure/indicators', label: 'Indicators' },
  { to: '/configure/frameworks', label: 'Frameworks' },
  { to: '/configure/option-sets', label: 'Option sets' },
  { to: '/configure/datasets', label: 'Datasets' },
  { to: '/configure/export-templates', label: 'Export templates' },
  { to: '/configure/validation', label: 'Validation' },
  { to: '/configure/users', label: 'Users & roles' },
  { to: '/configure/operations', label: 'Operations' },
] as const;

export function ConfigureLayout() {
  return (
    <div>
      <nav aria-label="Configure sections" className="mb-5 border-b border-hairline">
        <ul className="flex flex-wrap gap-4">
          {SECTIONS.map((s) => (
            <li key={s.to}>
              <Link
                to={s.to}
                activeOptions={{ exact: 'exact' in s && s.exact }}
                className="block border-b-2 border-transparent pb-1.5 text-sm text-ink-muted hover:text-ink"
                activeProps={{
                  className:
                    'block border-b-2 border-cobalt pb-1.5 text-sm font-medium text-cobalt',
                }}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
