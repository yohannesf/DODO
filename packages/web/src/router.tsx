import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router';
import { AppShell } from './shell/AppShell';
import { UpdateToast } from './shell/UpdateToast';
import { useAuth } from './auth/store';
import { startSyncLoop } from './sync/engine';
import { LoginPage } from './pages/Login';
import { EnterData } from './pages/EnterData';
import { Review } from './pages/Review';
import { Dashboards } from './pages/Dashboards';
import { Maps } from './pages/Maps';
import { Explore } from './pages/Explore';
import { Framework } from './pages/Framework';
import { SyncCenter } from './pages/SyncCenter';
import { ConfigureLayout } from './pages/configure/ConfigureLayout';
import { ConfigureOverview } from './pages/configure/Overview';
import { ProgramsPage } from './pages/configure/Programs';
import { OrgUnitsPage } from './pages/configure/OrgUnits';
import { DisaggregationPage } from './pages/configure/Disaggregation';
import { DataElementsPage } from './pages/configure/DataElements';
import { OptionSetsPage } from './pages/configure/OptionSets';
import { DatasetsPage } from './pages/configure/Datasets';
import { UsersPage } from './pages/configure/Users';
import { ValidationPage } from './pages/configure/Validation';

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <UpdateToast />
    </>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

let booted: Promise<void> | null = null;

// Pathless layout guarding everything behind auth; works offline through the
// cached session (spec §9).
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  component: AppShell,
  beforeLoad: async () => {
    const auth = useAuth.getState();
    if (auth.status === 'unknown') {
      booted ??= auth.boot();
      await booted;
    }
    if (useAuth.getState().status !== 'authed') {
      throw redirect({ to: '/login' });
    }
    startSyncLoop();
  },
});
const inShell = { getParentRoute: () => authedRoute };

const indexRoute = createRoute({
  ...inShell,
  path: '/',
  // Data-entry users land on Enter Data (spec §8.2).
  beforeLoad: () => {
    throw redirect({ to: '/enter' });
  },
});

const configureRoute = createRoute({
  ...inShell,
  path: '/configure',
  component: ConfigureLayout,
});
const configureChild = { getParentRoute: () => configureRoute };

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedRoute.addChildren([
    indexRoute,
    createRoute({ ...inShell, path: '/enter', component: EnterData }),
    createRoute({ ...inShell, path: '/review', component: Review }),
    createRoute({ ...inShell, path: '/dashboards', component: Dashboards }),
    createRoute({ ...inShell, path: '/maps', component: Maps }),
    createRoute({ ...inShell, path: '/explore', component: Explore }),
    createRoute({ ...inShell, path: '/framework', component: Framework }),
    createRoute({ ...inShell, path: '/sync', component: SyncCenter }),
    configureRoute.addChildren([
      createRoute({ ...configureChild, path: '/', component: ConfigureOverview }),
      createRoute({ ...configureChild, path: 'programs', component: ProgramsPage }),
      createRoute({ ...configureChild, path: 'org-units', component: OrgUnitsPage }),
      createRoute({
        ...configureChild,
        path: 'disaggregation',
        component: DisaggregationPage,
      }),
      createRoute({
        ...configureChild,
        path: 'data-elements',
        component: DataElementsPage,
      }),
      createRoute({ ...configureChild, path: 'option-sets', component: OptionSetsPage }),
      createRoute({ ...configureChild, path: 'datasets', component: DatasetsPage }),
      createRoute({ ...configureChild, path: 'validation', component: ValidationPage }),
      createRoute({ ...configureChild, path: 'users', component: UsersPage }),
    ]),
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
