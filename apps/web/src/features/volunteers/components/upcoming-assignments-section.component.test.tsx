import { screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { UpcomingAssignmentsSection } from './upcoming-assignments-section';
import { renderWithProviders } from '@/__tests__/setup/render';

/**
 * Pins the process ambient TZ away from both UTC and the Church Timezone
 * (ADR-0003: there is no viewer's clock — the rendered time must follow
 * `churchTimezone`, never the machine the test runs on).
 */
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata';
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('UpcomingAssignmentsSection (T157)', () => {
  it('renders event and assignment windows as dd/MM/yyyy HH:mm in the Church Timezone, not the ambient TZ', () => {
    renderWithProviders(
      <UpcomingAssignmentsSection
        expandedEventId="event-1"
        groups={[
          {
            eventId: 'event-1',
            eventTitle: 'Sunday Service',
            ministryId: 'ministry-1',
            ministryName: 'Greeters',
            eventStart: '2027-03-15T22:00:00.000Z',
            aggregateResponseState: 'pending',
            hasPendingResponse: true,
            assignments: [
              {
                assignmentId: 'assignment-1',
                slotId: 'slot-1',
                shiftId: 'shift-1',
                participationId: 'participation-1',
                roleId: 'role-1',
                roleName: 'Greeter',
                startTime: '2027-03-15T22:00:00.000Z',
                endTime: '2027-03-15T23:30:00.000Z',
                status: 'pending',
                timingState: 'upcoming',
                canRespond: true,
              },
            ],
          },
        ]}
        isOnline
        responseState="idle"
        cancelState="idle"
        onToggleEvent={vi.fn()}
        onRespond={vi.fn()}
        onCancel={vi.fn()}
      />,
      { churchTimezone: 'America/Sao_Paulo' },
    );

    // 22:00 UTC on 15 Mar is 19:00 in São Paulo (UTC-3) the same day, and
    // already 03:30 on 16 Mar in Kolkata (UTC+5:30) — proof this reads the
    // Church Timezone, not the process's ambient ID.
    expect(screen.getByText('15/03/2027 19:00')).toBeInTheDocument();
    expect(screen.getByText('15/03/2027 19:00 – 20:30')).toBeInTheDocument();
  });
});
