import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RenderResult, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { TimezoneProvider } from '@/shared/components/timezone-provider';

interface ProviderOptions {
  churchTimezone?: string;
}

/**
 * Renders a component inside the providers builder components depend on:
 * a fresh TanStack QueryClient (retries off) and the TimezoneProvider.
 * Pair with the MSW harness (`setup/msw.ts`) to mock tRPC at the network edge.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TimezoneProvider
          initialChurchTimezone={options.churchTimezone ?? 'UTC'}
        >
          {children}
        </TimezoneProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}
