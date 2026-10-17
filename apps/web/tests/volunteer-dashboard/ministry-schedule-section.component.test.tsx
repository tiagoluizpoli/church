import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MinistryScheduleSection } from '@/features/volunteers/components/ministry-schedule-section';
import { renderWithProviders } from '@/tests/setup/render';

const parked = vi.hoisted(() => ({ on: true }));

vi.mock('@church/app-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@church/app-config')>();
  return {
    ...actual,
    get appConfig() {
      return parked.on
        ? actual.withAllParkedOn(actual.appConfig)
        : actual.appConfig;
    },
  };
});

beforeEach(() => {
  parked.on = true;
});

describe('MinistryScheduleSection', () => {
  it('hides selector for single-ministry volunteers and renders formatted volunteer names', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MinistryScheduleSection
        ministries={[{ id: 'ministry-1', name: 'Adult Ministry' }]}
        selectedMinistryId="ministry-1"
        canSwitchMinistry={false}
        events={[
          {
            eventId: 'event-1',
            title: 'Sunday Service',
            start: '2026-07-06T09:00:00.000Z',
            end: '2026-07-06T11:00:00.000Z',
            assignmentCount: 2,
            rows: [
              {
                eventTimeBlockId: 'event-time-block-1',
                eventTimeBlockLabel: '9:00 AM - 11:00 AM',
                sectorName: 'Main Door',
                roleName: 'Usher',
                volunteerDisplayName: 'Alice T.',
                confirmationState: 'confirmed',
              },
              {
                eventTimeBlockId: 'event-time-block-1',
                eventTimeBlockLabel: '9:00 AM - 11:00 AM',
                sectorName: 'Side Door',
                roleName: 'Usher',
                volunteerDisplayName: 'Open',
                confirmationState: 'open',
              },
            ],
          },
        ]}
        isLoading={false}
        onSelectMinistry={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('combobox', { name: 'Select ministry' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Show schedule for Sunday Service' }),
    );

    expect(screen.getByText('Volunteer: Alice T.')).toBeInTheDocument();
    expect(screen.queryByText(/^Team:/)).not.toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Usher · Main Door')).toBeInTheDocument();
    expect(screen.getByText('Usher · Side Door')).toBeInTheDocument();
  });

  it('allows ministry switching and shows explicit empty state', async () => {
    const user = userEvent.setup();
    const onSelectMinistry = vi.fn();

    renderWithProviders(
      <MinistryScheduleSection
        ministries={[
          { id: 'ministry-1', name: 'Adult Ministry' },
          { id: 'ministry-2', name: 'Youth Ministry' },
        ]}
        selectedMinistryId="ministry-1"
        canSwitchMinistry={true}
        events={[]}
        isLoading={false}
        onSelectMinistry={onSelectMinistry}
      />,
    );

    expect(
      screen.getByText('No published ministry schedule yet'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Select ministry' }));
    // base-ui mounts the popup (portal + positioning) after the click settles,
    // so await the option instead of reading it synchronously.
    await user.click(
      await screen.findByRole('option', { name: 'Youth Ministry' }),
    );

    expect(onSelectMinistry).toHaveBeenCalledWith('ministry-2');
  });

  it('hides the confirmation state per row while the response is parked', async () => {
    parked.on = false;
    const user = userEvent.setup();

    renderWithProviders(
      <MinistryScheduleSection
        ministries={[{ id: 'ministry-1', name: 'Adult Ministry' }]}
        selectedMinistryId="ministry-1"
        canSwitchMinistry={false}
        events={[
          {
            eventId: 'event-1',
            title: 'Sunday Service',
            start: '2026-07-06T09:00:00.000Z',
            end: '2026-07-06T11:00:00.000Z',
            assignmentCount: 1,
            rows: [
              {
                eventTimeBlockId: 'event-time-block-1',
                eventTimeBlockLabel: '9:00 AM - 11:00 AM',
                sectorName: 'Main Door',
                roleName: 'Usher',
                volunteerDisplayName: 'Alice T.',
                confirmationState: 'confirmed',
              },
            ],
          },
        ]}
        isLoading={false}
        onSelectMinistry={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Show schedule for Sunday Service' }),
    );

    expect(screen.getByText('Volunteer: Alice T.')).toBeInTheDocument();
    expect(screen.queryByText('Confirmed')).not.toBeInTheDocument();
  });
});
