import { m } from '@church/i18n/messages';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActiveChurchTabSyncGuard } from '@/components/active-church-tab-sync-guard';
import { postActiveChurchSwitched } from '@/shared/utils/active-church-broadcast';
import { renderWithProviders } from '@/tests/setup/render';

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
    expect(dialog).toHaveTextContent(
      m.church_switch_sync_body({ churchName: 'Igreja Central' }),
    );

    await user.click(
      screen.getByRole('button', { name: m.church_switch_sync_continue() }),
    );

    expect(
      screen.queryByTestId('active-church-tab-sync-dialog'),
    ).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
  });
});
