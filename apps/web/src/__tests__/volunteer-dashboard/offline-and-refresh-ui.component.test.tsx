import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../setup/render';
import { AvailabilityForm } from '@/features/volunteers/components/availability-form';
import { BackgroundRefreshIndicator } from '@/features/volunteers/components/background-refresh-indicator';
import { DashboardOfflineBanner } from '@/features/volunteers/components/dashboard-offline-banner';
import { UpcomingAssignmentsSection } from '@/features/volunteers/components/upcoming-assignments-section';

describe('Volunteer dashboard offline + refresh UI', () => {
  it('shows dashboard offline banner with manual refresh affordance', () => {
    renderWithProviders(
      <DashboardOfflineBanner
        isOffline={true}
        isUsingCachedData={true}
        lastUpdatedAt="2099-01-05T08:00:00.000Z"
        onRefresh={vi.fn()}
        refreshState="idle"
      />,
    );

    expect(screen.getByText('Offline mode')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You are offline. Cached assignments, notifications, and ministry schedule data may be outdated.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh dashboard' }),
    ).toBeInTheDocument();
  });

  it('keeps availability and assignment write affordances disabled while offline', () => {
    renderWithProviders(
      <div>
        <AvailabilityForm
          event={{
            id: 'event-1',
            title: 'Youth Gathering',
            eventType: 'hourly',
            startDate: '2099-01-05T09:00:00.000Z',
            endDate: '2099-01-05T11:00:00.000Z',
          }}
          slots={[
            {
              slotId: 'slot-1',
              label: '8:00 AM Service',
              startTime: '2099-01-05T08:00:00.000Z',
              endTime: '2099-01-05T09:30:00.000Z',
              response: 'available',
            },
          ]}
          isEditable={true}
          isOnline={false}
          onSave={vi.fn()}
          saveState="idle"
        />

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
                  slotId: 'slot-1',
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

    expect(
      screen.getByRole('button', { name: 'Save availability' }),
    ).toBeDisabled();
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
