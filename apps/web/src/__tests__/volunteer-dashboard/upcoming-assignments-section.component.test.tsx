import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../setup/render';
import { UpcomingAssignmentsSection } from '@/features/volunteers/components/upcoming-assignments-section';
import type { DashboardAssignmentGroup } from '@/features/volunteers/lib/dashboard-mappers';

const assignmentGroupsFixture: DashboardAssignmentGroup[] = [
  {
    eventId: 'event-1',
    eventTitle: 'Sunday Service',
    ministryId: 'ministry-1',
    ministryName: 'Adult Ministry',
    eventStart: '2099-01-06T09:00:00.000Z',
    aggregateResponseState: 'pending',
    hasPendingResponse: true,
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
      {
        assignmentId: 'assignment-2',
        slotId: 'slot-2',
        shiftId: 'shift-2',
        participationId: 'participation-1',
        roleId: 'role-2',
        roleName: 'Greeter',
        startTime: '2099-01-06T11:00:00.000Z',
        endTime: '2099-01-06T12:00:00.000Z',
        status: 'pending',
        timingState: 'in_progress',
        canRespond: false,
      },
    ],
  },
];

describe('UpcomingAssignmentsSection', () => {
  it('requires typed confirmation before notifying that the volunteer cannot serve', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();

    renderWithProviders(
      <UpcomingAssignmentsSection
        groups={assignmentGroupsFixture}
        expandedEventId="event-1"
        isOnline={true}
        responseState="idle"
        cancelState="idle"
        onToggleEvent={vi.fn()}
        onRespond={onRespond}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        'This assignment is already in progress, so responses are locked.',
      ),
    ).toBeInTheDocument();

    const cannotServeButtons = screen.getAllByRole('button', {
      name: 'I cannot serve',
    });
    expect(cannotServeButtons[0]).toBeEnabled();
    expect(cannotServeButtons[1]).toBeDisabled();

    await user.click(cannotServeButtons[0]);

    expect(
      screen.getByRole('heading', {
        name: 'Confirm unable-to-serve notice',
      }),
    ).toBeVisible();
    expect(onRespond).not.toHaveBeenCalled();

    const confirmationInput = screen.getByLabelText(
      'Type the confirmation phrase',
    );

    await user.type(confirmationInput, 'wrong phrase');

    expect(
      screen.getByRole('button', { name: 'Confirm I cannot serve' }),
    ).toBeDisabled();

    await user.clear(confirmationInput);
    await user.type(confirmationInput, 'I cannot serve');

    await user.click(
      screen.getByRole('button', { name: 'Confirm I cannot serve' }),
    );

    expect(onRespond).toHaveBeenCalledWith({
      assignmentId: 'assignment-1',
      response: 'declined',
    });
  });

  it('lets the volunteer cancel the unable-to-serve confirmation dialog', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();

    renderWithProviders(
      <UpcomingAssignmentsSection
        groups={assignmentGroupsFixture}
        expandedEventId="event-1"
        isOnline={true}
        responseState="idle"
        cancelState="idle"
        onToggleEvent={vi.fn()}
        onRespond={onRespond}
        onCancel={vi.fn()}
      />,
    );

    const cannotServeButtons = screen.getAllByRole('button', {
      name: 'I cannot serve',
    });
    const firstCannotServeButton = cannotServeButtons[0];

    if (!firstCannotServeButton) {
      throw new Error('Missing cannot-serve action');
    }

    await user.click(firstCannotServeButton);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByRole('heading', {
        name: 'Confirm unable-to-serve notice',
      }),
    ).not.toBeInTheDocument();
    expect(onRespond).not.toHaveBeenCalled();
  });

  it('shows offline blocking state for assignment responses', () => {
    renderWithProviders(
      <UpcomingAssignmentsSection
        groups={assignmentGroupsFixture}
        expandedEventId="event-1"
        isOnline={false}
        responseState="idle"
        cancelState="idle"
        onToggleEvent={vi.fn()}
        onRespond={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Assignment responses stay blocked until your connection returns.',
      ),
    ).toBeInTheDocument();

    for (const button of screen.getAllByRole('button', {
      name: 'I cannot serve',
    })) {
      expect(button).toBeDisabled();
    }
  });

  it('lets a volunteer cancel their own confirmed upcoming assignment (FR-028)', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    renderWithProviders(
      <UpcomingAssignmentsSection
        groups={assignmentGroupsFixture}
        expandedEventId="event-1"
        isOnline={true}
        responseState="idle"
        cancelState="idle"
        onToggleEvent={vi.fn()}
        onRespond={vi.fn()}
        onCancel={onCancel}
      />,
    );

    const cancelButtons = screen.getAllByTestId('cancel-assignment-button');
    expect(cancelButtons).toHaveLength(1);

    const cancelButton = cancelButtons[0];
    if (!cancelButton) {
      throw new Error('Missing cancel-assignment action');
    }

    await user.click(cancelButton);

    expect(onCancel).toHaveBeenCalledWith('assignment-1');
  });
});
