import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../__tests__/setup/render';
import { ActiveChurchTabSyncGuard } from './active-church-tab-sync-guard';
import { postActiveChurchSwitched } from '@/shared/utils/active-church-broadcast';

let mockHref = '/dashboard';
const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ href: mockHref }),
  useNavigate: () => mockNavigate,
}));

describe('ActiveChurchTabSyncGuard', () => {
  it('renders nothing when no other tab has switched', () => {
    renderWithProviders(<ActiveChurchTabSyncGuard />);

    expect(
      screen.queryByTestId('active-church-tab-sync-dialog'),
    ).not.toBeInTheDocument();
  });

  it('blocks with the new Church named, and Continue dismisses it', async () => {
    mockHref = '/dashboard';
    const user = userEvent.setup();
    renderWithProviders(<ActiveChurchTabSyncGuard />);

    act(() => {
      postActiveChurchSwitched({
        availableAreas: ['dashboard'],
        churchId: 'church-b',
        churchName: 'Igreja Central',
      });
    });

    const dialog = await screen.findByTestId('active-church-tab-sync-dialog');
    expect(dialog).toHaveTextContent('Igreja Central');

    await user.click(screen.getByTestId('active-church-tab-sync-continue'));

    expect(
      screen.queryByTestId('active-church-tab-sync-dialog'),
    ).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
  });
});
