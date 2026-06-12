import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { AppShell } from './shell/AppShell';
import { EnterData } from './pages/EnterData';
import { Review } from './pages/Review';
import { Dashboards } from './pages/Dashboards';
import { Maps } from './pages/Maps';
import { Explore } from './pages/Explore';
import { Framework } from './pages/Framework';
import { ConfigureLayout } from './pages/configure/ConfigureLayout';
import { ConfigureOverview } from './pages/configure/Overview';
import { ProgramsPage } from './pages/configure/Programs';
import { OrgUnitsPage } from './pages/configure/OrgUnits';
import { DisaggregationPage } from './pages/configure/Disaggregation';
import { DataElementsPage } from './pages/configure/DataElements';
import { OptionSetsPage } from './pages/configure/OptionSets';
import { DatasetsPage } from './pages/configure/Datasets';
import { UsersPage } from './pages/configure/Users';

const rootRoute = createRootRoute({ component: AppShell });
const parent = { getParentRoute: () => rootRoute };

const indexRoute = createRoute({
  ...parent,
  path: '/',
  // Data-entry users land on Enter Data (spec §8.2); role-based landing
  // arrives with auth.
  beforeLoad: () => {
    throw redirect({ to: '/enter' });
  },
});

const configureRoute = createRoute({
  ...parent,
  path: '/configure',
  component: ConfigureLayout,
});
const configureChild = { getParentRoute: () => configureRoute };

const routeTree = rootRoute.addChildren([
  indexRoute,
  createRoute({ ...parent, path: '/enter', component: EnterData }),
  createRoute({ ...parent, path: '/review', component: Review }),
  createRoute({ ...parent, path: '/dashboards', component: Dashboards }),
  createRoute({ ...parent, path: '/maps', component: Maps }),
  createRoute({ ...parent, path: '/explore', component: Explore }),
  createRoute({ ...parent, path: '/framework', component: Framework }),
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
    createRoute({ ...configureChild, path: 'users', component: UsersPage }),
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
