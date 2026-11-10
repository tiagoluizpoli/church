import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundRefreshIndicator } from '@/features/volunteers/components/background-refresh-indicator';
import { UpcomingAssignmentsSection } from '@/features/volunteers/components/upcoming-assignments-section';
import { renderWithProviders } from '@/tests/setup/render';

vi.mock('@church/app-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@church/app-config')>();
  return {
    ...actual,
    appConfig: actual.withAllParkedOn(actual.appConfig),
  };
});

describe('Volunteer dashboard offline + refresh UI', () => {
  it('keeps assignment write affordances disabled while offline', () => {
    renderWithProviders(
      <div>
        <UpcomingAssignmentsSection
          groups={[
            {
              eventId: 'event-1',
              eventTitle: 'Sunday Service',
              ministryId: 'ministry-1',
              ministryName: 'Adult Ministry',
              eventStart: '2099-01-06T09:00:00.000Z',
              aggregateResponseState: 'confirmed',
              hasPendingResponse: false,
              assignments: [
                {
                  assignmentId: 'assignment-1',
                  eventTimeBlockId: 'event-time-block-1',
                  shiftId: 'shift-1',
                  participationId: 'participation-1',
                  roleId: 'role-1',
                  roleName: 'Usher',
                  startTime: '2099-01-06T09:00:00.000Z',
                  endTime: '2099-01-06T11:00:00.000Z',
                  status: 'confirmed',
                  timingState: 'upcoming',
                  canRespond: true,
                },
              ],
            },
          ]}
          expandedEventId="event-1"
          isOnline={false}
          responseState="idle"
          cancelState="idle"
          onToggleEvent={vi.fn()}
          onRespond={vi.fn()}
          onCancel={vi.fn()}
        />
      </div>,
    );

    const cannotServeButtons = screen.getAllByRole('button', {
      name: 'I cannot serve',
    });
    expect(
      cannotServeButtons.every((button) => button.hasAttribute('disabled')),
    ).toBe(true);
  });

  it('renders background refresh indicator when visible', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    renderWithProviders(
      <BackgroundRefreshIndicator visible={true} onDismiss={onDismiss} />,
    );

    expect(screen.getByText('Updated in background')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
