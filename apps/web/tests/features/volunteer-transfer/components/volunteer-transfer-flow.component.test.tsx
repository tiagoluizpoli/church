import { m } from '@church/i18n/messages';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VolunteerTransferFlow } from '@/features/volunteer-transfer/components/volunteer-transfer-flow';
import { renderWithProviders } from '@/tests/setup/render';

const api = vi.hoisted(() => ({ getVolunteerTransferPreview: vi.fn() }));
vi.mock('@/utils/api-instances', () => ({ redemptionApi: api }));

beforeEach(() => vi.resetAllMocks());

describe('VolunteerTransferFlow loading', () => {
  it('shows a skeleton, not text, after the pending delay while the preview loads', async () => {
    api.getVolunteerTransferPreview.mockReturnValue(new Promise(() => {}));
    renderWithProviders(
      <VolunteerTransferFlow
        invitationId="inv-1"
        sourceChurchName="Old"
        destinationChurchName="New"
        onContinueAsMember={vi.fn()}
        onTransferred={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.volunteer_transfer_move_action() }),
    );
    const region = screen.getByRole('status', {
      name: m.volunteer_transfer_checking(),
    });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toBeEmptyDOMElement();
    await waitFor(() =>
      expect(region.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
  });

  it('keeps the review shown, with no skeleton, while the preview refetches', async () => {
    const queryClient = new QueryClient();
    api.getVolunteerTransferPreview.mockResolvedValue({
      kind: 'reviewable',
      sourceChurchName: 'Old',
      destinationChurchName: 'New',
      endedMemberships: [{ ministryName: 'Kids' }],
      withdrawnAssignments: [],
    });
    renderWithProviders(
      <VolunteerTransferFlow
        invitationId="inv-1"
        sourceChurchName="Old"
        destinationChurchName="New"
        onContinueAsMember={vi.fn()}
        onTransferred={vi.fn()}
      />,
      { queryClient },
    );
    await userEvent.click(
      screen.getByRole('button', { name: m.volunteer_transfer_move_action() }),
    );
    expect(await screen.findByText('Kids')).toBeVisible();
    api.getVolunteerTransferPreview.mockClear();
    api.getVolunteerTransferPreview.mockReturnValue(new Promise(() => {}));
    void queryClient.invalidateQueries();
    await waitFor(() =>
      expect(api.getVolunteerTransferPreview).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText('Kids')).toBeVisible();
    expect(
      screen.queryByRole('status', { name: m.volunteer_transfer_checking() }),
    ).toBeNull();
  });
});
