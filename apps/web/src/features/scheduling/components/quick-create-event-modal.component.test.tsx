import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickCreateEventModal } from './quick-create-event-modal';

const navigateMock = vi.fn();
const mutateAsyncMock = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    isPending: false,
    mutateAsync: mutateAsyncMock,
  }),
}));

vi.mock('@/utils/trpc', () => ({
  trpc: {
    adminLeader: {
      createEvent: {
        mutationOptions: () => ({}),
      },
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('QuickCreateEventModal', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    mutateAsyncMock.mockReset();
  });

  it('enables create after valid date and time values are entered', async () => {
    const user = userEvent.setup();

    render(
      <QuickCreateEventModal
        open={true}
        onOpenChange={vi.fn()}
        ministryId="ministry-1"
        onCreated={vi.fn()}
      />,
    );

    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toBeDisabled();

    await user.type(screen.getByLabelText('Title'), 'Domingo');
    await user.type(screen.getByLabelText('Start date'), '2026-06-28');
    await user.type(screen.getByLabelText('Start hour'), '09');
    await user.type(screen.getByLabelText('Start minute'), '30');
    await user.type(screen.getByLabelText('End date'), '2026-06-28');
    await user.type(screen.getByLabelText('End hour'), '11');
    await user.type(screen.getByLabelText('End minute'), '30');

    expect(createButton).toBeEnabled();
  });
});
