import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickCreateEventModal } from './quick-create-event-modal';
import { pickCalendarDate } from '@/__tests__/setup/date-picker';

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
  useQueryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
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

  it('enables create for an hourly event after title and a single date are entered', async () => {
    const user = userEvent.setup();

    render(
      <QuickCreateEventModal
        open={true}
        onOpenChange={vi.fn()}
        target={{ kind: 'ministry', ministryId: 'ministry-1' }}
        onCreated={vi.fn()}
      />,
    );

    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toBeDisabled();

    expect(screen.getByLabelText('Date')).toBeVisible();
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Title'), 'Domingo');
    await pickCalendarDate({
      user,
      trigger: screen.getByLabelText('Date'),
      date: '2026-06-28',
    });

    expect(createButton).toBeEnabled();
  }, 30000);

  it('switches to a start/end date range for a day-based event, and stays the same reachable form for a planning-cycle target (FR-012)', async () => {
    const user = userEvent.setup();

    render(
      <QuickCreateEventModal
        open={true}
        onOpenChange={vi.fn()}
        target={{ kind: 'planning-cycle', cycleId: 'cycle-1' }}
        onCreated={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Title')).toBeVisible();
    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Day-based' }));

    expect(screen.getByLabelText('Start date')).toBeVisible();
    expect(screen.getByLabelText('End date')).toBeVisible();
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Title'), 'Retreat');
    await pickCalendarDate({
      user,
      trigger: screen.getByLabelText('Start date'),
      date: '2026-06-28',
    });
    await pickCalendarDate({
      user,
      trigger: screen.getByLabelText('End date'),
      date: '2026-06-29',
    });

    expect(createButton).toBeEnabled();
  }, 30000);
});
