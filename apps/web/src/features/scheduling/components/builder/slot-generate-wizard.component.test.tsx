import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SlotGenerateWizard } from './slot-generate-wizard';
import { mswServer, trpcMsw } from '@/__tests__/setup/msw';
import { renderWithProviders } from '@/__tests__/setup/render';

beforeAll(() => {
  // listRoleTemplates fires on open; default it to empty so nothing 404s.
  mswServer.use(trpcMsw.adminLeader.listRoleTemplates.query(() => []));
});
afterEach(() => mswServer.resetHandlers());

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  eventId: 'event-1',
  ministryId: 'ministry-1',
  onComplete: vi.fn(),
};

function render() {
  mswServer.use(
    trpcMsw.adminLeader.listRoleTemplates.query(() => []),
    trpcMsw.adminLeader.generateSlots.mutation(() => ({
      slotCount: 1,
      preview: [
        {
          startTime: '2026-05-10T09:00:00.000Z',
          endTime: '2026-05-10T10:00:00.000Z',
          label: 'Generated Slot 1',
        },
      ],
    })),
  );
  return renderWithProviders(<SlotGenerateWizard {...baseProps} />);
}

describe('SlotGenerateWizard (T114)', () => {
  it('opens on step 1 with strategy options', () => {
    render();
    expect(screen.getByText(/step 1 of 3/i)).toBeVisible();
    expect(screen.getByText(/by duration/i)).toBeVisible();
    expect(screen.getByText(/by count/i)).toBeVisible();
  });

  it('disables Next when the value is below 1', async () => {
    const user = userEvent.setup();
    render();
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '0');
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('loads a preview on Next and advances to step 2', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(screen.getByText(/step 2 of 3/i)).toBeVisible());
    expect(screen.getByText(/Generated Slot 1/)).toBeVisible();
  });
});
