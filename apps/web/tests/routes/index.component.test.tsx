import { waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvedActiveChurchStatus } from '@/tests/setup/active-church';
import { renderRoute } from '@/tests/setup/render-route';

const getSession = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    organization: { getActiveMember: vi.fn() },
  },
}));

vi.mock('@/utils/api-instances', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/api-instances')>()),
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: () => null,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

describe('the root route (/)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { activeChurchApiMock } = await import('@/tests/setup/active-church');
    activeChurchApiMock.getActiveChurchStatus.mockResolvedValue(
      resolvedActiveChurchStatus(),
    );
  });

  it('sends a signed-in visitor to /app', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const { router } = renderRoute({ initialPath: '/' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app');
    });
  });

  it('sends a signed-out visitor to /login', async () => {
    getSession.mockResolvedValue({ data: null });

    const { router } = renderRoute({ initialPath: '/' });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.search).toEqual({});
  });

  it('renders no content of its own', () => {
    getSession.mockReturnValue(new Promise(() => {}));

    const { container } = renderRoute({ initialPath: '/' });

    expect(container).toBeEmptyDOMElement();
  });
});
