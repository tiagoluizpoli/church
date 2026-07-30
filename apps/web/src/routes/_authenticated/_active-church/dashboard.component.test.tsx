import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '@/__tests__/setup/render-route';

const getSession = vi.fn();
const getActiveChurchStatus = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    signOut: vi.fn(),
  },
}));

vi.mock('@/utils/api-instances', () => ({
  activeChurchApi: {
    getActiveChurchStatus: (...args: unknown[]) =>
      getActiveChurchStatus(...args),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

vi.mock('@/features/volunteers/components/volunteer-dashboard', () => ({
  VolunteerDashboard: () => <div>Volunteer dashboard stub</div>,
}));

const toastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: { info: (...args: unknown[]) => toastInfo(...args) },
}));

function renderDashboard(initialPath = '/dashboard') {
  return renderRoute({ initialPath });
}

describe('dashboard route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { user: { id: 'u1', name: 'Dual Member' }, session: {} },
    });
    getActiveChurchStatus.mockResolvedValue({
      status: 'resolved',
      churchId: 'church-1',
    });
  });

  it('toasts a removal notice naming the former Church when redirected here with removedFrom', async () => {
    renderDashboard('/dashboard?removedFrom=Old+Church');

    await screen.findByText('Volunteer dashboard stub');
    await waitFor(() => {
      expect(toastInfo).toHaveBeenCalledWith(
        expect.stringContaining('Old Church'),
      );
    });
  });

  it('does not toast on a plain, unprompted visit', async () => {
    renderDashboard();

    await screen.findByText('Volunteer dashboard stub');
    expect(toastInfo).not.toHaveBeenCalled();
  });
});
