import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { type RenderResult, render } from '@testing-library/react';
import { routeTree } from '@/routeTree.gen';
import { TimezoneProvider } from '@/shared/components/timezone-provider';

interface RenderRouteOptions {
  initialPath: string;
}

interface RenderRouteResult extends RenderResult {
  queryClient: QueryClient;
  router: ReturnType<typeof createRouter<typeof routeTree>>;
}

/**
 * Mounts the real app route tree (from `routeTree.gen.ts`) at a given path,
 * via `createMemoryHistory` — the `RouterProvider`-based component-test
 * pattern this repo didn't have before Phase 8 (`research.md` R6). Callers
 * must mock `@/components/app-shell` (root layout chrome isn't under test)
 * plus whatever API modules their route touches.
 */
export function renderRoute({
  initialPath,
}: RenderRouteOptions): RenderRouteResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    context: { queryClient },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <TimezoneProvider initialChurchTimezone="UTC">
        <RouterProvider router={router} />
      </TimezoneProvider>
    </QueryClientProvider>,
  );

  return { ...result, queryClient, router };
}
