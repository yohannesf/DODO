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
import { Configure } from './pages/Configure';

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

const routeTree = rootRoute.addChildren([
  indexRoute,
  createRoute({ ...parent, path: '/enter', component: EnterData }),
  createRoute({ ...parent, path: '/review', component: Review }),
  createRoute({ ...parent, path: '/dashboards', component: Dashboards }),
  createRoute({ ...parent, path: '/maps', component: Maps }),
  createRoute({ ...parent, path: '/explore', component: Explore }),
  createRoute({ ...parent, path: '/framework', component: Framework }),
  createRoute({ ...parent, path: '/configure', component: Configure }),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
