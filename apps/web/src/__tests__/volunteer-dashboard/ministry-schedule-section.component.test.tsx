import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../setup/render';
import { MinistryScheduleSection } from '@/features/volunteers/components/ministry-schedule-section';

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
            startDate: '2026-07-06T09:00:00.000Z',
            endDate: '2026-07-06T11:00:00.000Z',
            assignmentCount: 2,
            rows: [
              {
                slotId: 'slot-1',
                slotLabel: '9:00 AM - 11:00 AM',
                roleName: 'Usher',
                teamName: 'Welcome Team',
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

    expect(
      screen.queryByRole('combobox', { name: 'Select ministry' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Show schedule for Sunday Service' }),
    );

    expect(screen.getByText('Volunteer: Alice T.')).toBeInTheDocument();
    expect(screen.getByText('Team: Welcome Team')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
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
    await user.click(screen.getByRole('option', { name: 'Youth Ministry' }));

    expect(onSelectMinistry).toHaveBeenCalledWith('ministry-2');
  });
});
