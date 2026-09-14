import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { type RenderResult, render } from '@testing-library/react';
import {
  activeChurchApiMock,
  resolvedActiveChurchStatus,
} from './active-church';
import { routeTree } from '@/routeTree.gen';
import { activeChurchApi } from '@/utils/api-instances';

interface RenderRouteOptions {
  initialPath: string;
  /**
   * Resolves the entry gate to the default Active Church in this Church
   * Timezone, which `_active-church` hands its layout's `TimezoneProvider` —
   * the same mount point the app uses. Requires the file to mock
   * `activeChurchApi` with `activeChurchApiMock` (`./active-church`). Omit it
   * to drive the status yourself: unresolved or redirecting statuses, several
   * Churches, or routes that never reach `_active-church` — resolving the
   * mock with `resolvedActiveChurchStatus()`, whose zone defaults to
   * `DEFAULT_CHURCH_TIMEZONE`.
   */
  churchTimezone?: string;
}

interface RenderRouteResult extends RenderResult {
  queryClient: QueryClient;
  router: ReturnType<typeof createRouter<typeof routeTree>>;
}

interface SeedResolvedActiveChurchInput {
  churchTimezone: string;
}

function seedResolvedActiveChurch({
  churchTimezone,
}: SeedResolvedActiveChurchInput): void {
  // Seeding a mock the route never reads would pass silently with whatever
  // the file's own mock returns — so a mismatched wiring fails here instead.
  if (
    activeChurchApi.getActiveChurchStatus !==
    activeChurchApiMock.getActiveChurchStatus
  ) {
    throw new Error(
      'renderRoute({ churchTimezone }) needs `activeChurchApi` mocked with `activeChurchApiMock` from `@/__tests__/setup/active-church`',
    );
  }
  activeChurchApiMock.getActiveChurchStatus.mockResolvedValue(
    resolvedActiveChurchStatus({ timezone: churchTimezone }),
  );
}

/**
 * Mounts the real app route tree (from `routeTree.gen.ts`) at a given path,
 * via `createMemoryHistory` — the `RouterProvider`-based component-test
 * pattern this repo didn't have before Phase 8 (`research.md` R6). Callers
 * must mock `@/components/app-shell` (root layout chrome isn't under test)
 * plus whatever API modules their route touches. A route under
 * `_active-church` gets its Church Timezone only from the entry gate's
 * resolved status — pass `churchTimezone`, or resolve the status mock with
 * `resolvedActiveChurchStatus` — and fails without one, like the real app.
 */
export function renderRoute({
  initialPath,
  churchTimezone,
}: RenderRouteOptions): RenderRouteResult {
  if (churchTimezone !== undefined) {
    seedResolvedActiveChurch({ churchTimezone });
  }

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
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...result, queryClient, router };
}
