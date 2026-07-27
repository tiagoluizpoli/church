import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useLocation,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { AppShell } from '@/components/app-shell';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { useMinistryBreadcrumb } from '@/features/scheduling/hooks/use-ministry-breadcrumb';
import { usePlanningCycleBreadcrumb } from '@/features/scheduling/hooks/use-planning-cycle-breadcrumb';

import '../index.css';

export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: 'church',
      },
      {
        name: 'description',
        content: 'church is a web application',
      },
    ],
    links: [
      {
        rel: 'icon',
        href: '/favicon.ico',
      },
    ],
  }),
});

function RootComponent() {
  const location = useLocation();
  const isPrototypeRoute = location.pathname.startsWith('/prototype/');
  const planningCycleBreadcrumb = usePlanningCycleBreadcrumb();
  const ministryBreadcrumb = useMinistryBreadcrumb();
  const overrides = [planningCycleBreadcrumb, ministryBreadcrumb].filter(
    (override) => override !== null,
  );
  const breadcrumbOverrides = overrides.length > 0 ? overrides : undefined;

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        {isPrototypeRoute ? (
          <Outlet />
        ) : (
          <AppShell breadcrumbOverrides={breadcrumbOverrides}>
            <Outlet />
          </AppShell>
        )}
        <Toaster richColors />
      </ThemeProvider>
      {isPrototypeRoute ? null : (
        <>
          <TanStackRouterDevtools position="bottom-left" />
          <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        </>
      )}
    </>
  );
}
