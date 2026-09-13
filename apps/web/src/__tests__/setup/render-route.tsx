import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { type RenderResult, render } from '@testing-library/react';
import { vi } from 'vitest';
import type {
  GetActiveChurchStatus200,
  SelectActiveChurch200,
} from '@/infrastructure/api/churchAPI.schemas';
import { routeTree } from '@/routeTree.gen';
import { activeChurchApi } from '@/utils/api-instances';

/** Matches the `church.timezone` column default and `renderWithProviders`. */
const DEFAULT_TEST_CHURCH_TIMEZONE = 'UTC';

interface RenderRouteOptions {
  initialPath: string;
  /**
   * Church Timezone the entry gate resolves with. Filled into every resolved
   * active-church status the test's mock returns without a `timezone` key; a
   * mock that names `timezone` (even as `undefined`) is left as written.
   */
  churchTimezone?: string;
}

interface RenderRouteResult extends RenderResult {
  queryClient: QueryClient;
  router: ReturnType<typeof createRouter<typeof routeTree>>;
}

interface WithChurchTimezoneInput<Status> {
  status: Status;
  churchTimezone: string;
}

interface SupplyChurchTimezoneInput {
  churchTimezone: string;
}

type ActiveChurchStatus = GetActiveChurchStatus200 | SelectActiveChurch200;

function withChurchTimezone<Status extends ActiveChurchStatus>({
  status,
  churchTimezone,
}: WithChurchTimezoneInput<Status>): Status {
  if (status?.status === 'resolved' && !Object.hasOwn(status, 'timezone')) {
    return { ...status, timezone: churchTimezone };
  }
  return status;
}

let restoreEntryGate: (() => void) | undefined;

/**
 * Wraps whatever the test mocked for the entry gate's two status calls so the
 * Church Timezone reaches the real mount point — `_active-church`'s
 * `beforeLoad` route context and the `TimezoneProvider` its layout mounts —
 * rather than a second provider stacked above the router.
 */
function supplyChurchTimezone({
  churchTimezone,
}: SupplyChurchTimezoneInput): void {
  restoreEntryGate?.();
  restoreEntryGate = undefined;

  // Not every test's module mock defines both calls.
  const getStatus = activeChurchApi.getActiveChurchStatus;
  const selectChurch = activeChurchApi.selectActiveChurch;
  const restores: Array<() => void> = [];

  if (typeof getStatus === 'function') {
    const spy = vi
      .spyOn(activeChurchApi, 'getActiveChurchStatus')
      .mockImplementation(async (...args) =>
        withChurchTimezone({
          status: await getStatus(...args),
          churchTimezone,
        }),
      );
    restores.push(() => spy.mockRestore());
  }
  if (typeof selectChurch === 'function') {
    const spy = vi
      .spyOn(activeChurchApi, 'selectActiveChurch')
      .mockImplementation(async (...args) =>
        withChurchTimezone({
          status: await selectChurch(...args),
          churchTimezone,
        }),
      );
    restores.push(() => spy.mockRestore());
  }

  restoreEntryGate = () => {
    for (const restore of restores) restore();
  };
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
  churchTimezone = DEFAULT_TEST_CHURCH_TIMEZONE,
}: RenderRouteOptions): RenderRouteResult {
  supplyChurchTimezone({ churchTimezone });

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
