import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HomePage } from '@/features/home/components/home-page';
import type { HomeSearch } from '@/features/home/lib/home-search';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
import { DEFAULT_CHURCH_ID } from '@/tests/setup/active-church';

export const HOME_USER_ID = 'user-1';

interface RenderHomePageInput {
  search?: HomeSearch;
  queryClient?: QueryClient;
  churchId?: string;
}

/**
 * Renders Home with the real capability hook under the Church scope the
 * layout provides. Mock the API boundary with `callerCapabilitiesApiMock`
 * (`@/tests/setup/caller-capabilities`) and `activeChurchApiMock`
 * (`@/tests/setup/active-church`).
 */
export function renderHomePage({
  search = {},
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
  churchId = DEFAULT_CHURCH_ID,
}: RenderHomePageInput = {}) {
  const tree = (nextSearch: HomeSearch) => (
    <QueryClientProvider client={queryClient}>
      <CallerCapabilitiesScopeProvider
        churchId={churchId}
        userId={HOME_USER_ID}
      >
        <HomePage search={nextSearch} />
      </CallerCapabilitiesScopeProvider>
    </QueryClientProvider>
  );
  const result = render(tree(search));
  return { ...result, queryClient };
}
