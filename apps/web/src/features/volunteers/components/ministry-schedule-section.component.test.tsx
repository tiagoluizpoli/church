import { screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MinistryScheduleSection } from './ministry-schedule-section';
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

describe('MinistryScheduleSection (T157)', () => {
  it('renders an event window as dd/MM/yyyy HH:mm – HH:mm in the Church Timezone, not the ambient TZ', () => {
    renderWithProviders(
      <MinistryScheduleSection
        ministries={[{ id: 'ministry-1', name: 'Greeters' }]}
        selectedMinistryId="ministry-1"
        canSwitchMinistry={false}
        events={[
          {
            eventId: 'event-1',
            title: 'Sunday Service',
            start: '2027-06-10T13:00:00.000Z',
            end: '2027-06-10T15:30:00.000Z',
            assignmentCount: 2,
            rows: [],
          },
        ]}
        isLoading={false}
        onSelectMinistry={vi.fn()}
      />,
      { churchTimezone: 'America/Sao_Paulo' },
    );

    // 13:00-15:30 UTC on 10 Jun is 10:00-12:30 in São Paulo (UTC-3) the same
    // day, and 18:30-21:00 in Kolkata (UTC+5:30) — proof this reads the
    // Church Timezone, not the process's ambient ID.
    expect(screen.getByText('10/06/2027 10:00 – 12:30')).toBeInTheDocument();
  });
});
