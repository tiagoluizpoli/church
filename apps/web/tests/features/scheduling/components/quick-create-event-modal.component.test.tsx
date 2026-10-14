import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickCreateEventModal } from '@/features/scheduling/components/quick-create-event-modal';
import { TimezoneProvider } from '@/shared/components/timezone-provider';
import { pickCalendarDate } from '@/tests/setup/date-picker';

const mutateAsyncMock = vi.fn();

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
    mutateAsyncMock.mockReset();
  });

  it('enables create after title and only a start date are entered (single-day Event)', async () => {
    const user = userEvent.setup();

    render(
      <TimezoneProvider churchTimezone="UTC">
        <QuickCreateEventModal
          open={true}
          onOpenChange={vi.fn()}
          cycleId="cycle-1"
          onCreated={vi.fn()}
        />
      </TimezoneProvider>,
    );

    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toBeDisabled();

    await user.type(screen.getByLabelText('Title'), 'Domingo');
    await pickCalendarDate({
      user,
      trigger: screen.getByLabelText('Start date'),
      date: '2026-06-28',
    });

    expect(createButton).toBeEnabled();
  }, 30000);

  it('enables create for a start/end date range (FR-012)', async () => {
    const user = userEvent.setup();

    render(
      <TimezoneProvider churchTimezone="UTC">
        <QuickCreateEventModal
          open={true}
          onOpenChange={vi.fn()}
          cycleId="cycle-1"
          onCreated={vi.fn()}
        />
      </TimezoneProvider>,
    );

    expect(screen.getByLabelText('Title')).toBeVisible();
    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toBeDisabled();

    expect(screen.getByLabelText('Start date')).toBeVisible();
    expect(screen.getByLabelText('End date (optional)')).toBeVisible();

    await user.type(screen.getByLabelText('Title'), 'Retreat');
    await pickCalendarDate({
      user,
      trigger: screen.getByLabelText('Start date'),
      date: '2026-06-28',
    });
    await pickCalendarDate({
      user,
      trigger: screen.getByLabelText('End date (optional)'),
      date: '2026-06-29',
    });

    expect(createButton).toBeEnabled();
  }, 30000);

  it('sends the picked day as Church-Timezone midnight bounds under a different ambient TZ (#149)', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({});

    render(
      <TimezoneProvider churchTimezone="America/Sao_Paulo">
        <QuickCreateEventModal
          open={true}
          onOpenChange={vi.fn()}
          cycleId="cycle-1"
          onCreated={vi.fn()}
        />
      </TimezoneProvider>,
    );

    await user.type(screen.getByLabelText('Title'), 'Domingo');
    await pickCalendarDate({
      user,
      trigger: screen.getByLabelText('Start date'),
      date: '2026-06-28',
    });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      title: 'Domingo',
      start: '2026-06-28T03:00:00.000Z',
      end: '2026-06-29T02:59:59.999Z',
    });
  }, 30000);
});
