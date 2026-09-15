import { screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AvailabilityCheckDetail } from './availability-check-detail';
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

describe('AvailabilityCheckDetail (T157)', () => {
  it('renders a shift window and whole-day label in the Church Timezone, not the ambient TZ', () => {
    renderWithProviders(
      <AvailabilityCheckDetail
        check={{
          id: 'check-1',
          planningCycleId: 'cycle-1',
          planningCycleName: 'Q1 Cycle',
          ministryId: 'ministry-1',
          ministryName: 'Greeters',
          state: 'pending',
          shifts: [
            {
              shiftId: 'shift-1',
              eventId: 'event-1',
              eventTitle: 'Sunday Service',
              startTime: '2027-01-04T12:00:00.000Z',
              endTime: '2027-01-04T14:00:00.000Z',
              available: true,
            },
          ],
        }}
        markDraft={{ markedShiftIds: new Set(), wholeDayDates: new Set() }}
        onToggleShift={vi.fn()}
        onToggleWholeDay={vi.fn()}
        onSaveMarks={vi.fn()}
        onConfirm={vi.fn()}
        isSavingMarks={false}
        isConfirming={false}
        overlapWarningVisible={false}
      />,
      { churchTimezone: 'America/Sao_Paulo' },
    );

    // 12:00-14:00 UTC on 4 Jan is 09:00-11:00 in São Paulo (UTC-3) the same
    // day, and 17:30-19:30 in Kolkata (UTC+5:30) — proof this reads the
    // Church Timezone, not the process's ambient ID.
    expect(screen.getByText('04/01/2027 09:00 – 11:00')).toBeInTheDocument();
    expect(screen.getByText('Whole day (04/01/2027)')).toBeInTheDocument();
  });

  it('renders the confirmed date as dd/MM/yyyy in the Church Timezone, not the ambient TZ', () => {
    renderWithProviders(
      <AvailabilityCheckDetail
        check={{
          id: 'check-1',
          planningCycleId: 'cycle-1',
          planningCycleName: 'Q1 Cycle',
          ministryId: 'ministry-1',
          ministryName: 'Greeters',
          state: 'confirmed',
          confirmedAt: '2027-01-04T23:15:00.000Z',
          shifts: [],
        }}
        markDraft={{ markedShiftIds: new Set(), wholeDayDates: new Set() }}
        onToggleShift={vi.fn()}
        onToggleWholeDay={vi.fn()}
        onSaveMarks={vi.fn()}
        onConfirm={vi.fn()}
        isSavingMarks={false}
        isConfirming={false}
        overlapWarningVisible={false}
      />,
      { churchTimezone: 'America/Sao_Paulo' },
    );

    // 23:15 UTC on 4 Jan is still 20:15 in São Paulo (UTC-3) the same day,
    // but already 4:45 the next day in Kolkata (UTC+5:30) — proof this reads
    // the Church Timezone, not the process's ambient ID.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent === 'Confirmed on 04/01/2027.',
      ),
    ).toBeInTheDocument();
  });
});
