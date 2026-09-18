import { screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AvailabilityForm } from './availability-form';
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

describe('AvailabilityForm (T157)', () => {
  it('renders a slot window as dd/MM/yyyy HH:mm – HH:mm in the Church Timezone, not the ambient TZ', () => {
    renderWithProviders(
      <AvailabilityForm
        event={{
          id: 'event-1',
          title: 'Sunday Service',
          eventType: 'hourly',
          start: '2027-01-04T12:00:00.000Z',
          end: '2027-01-04T14:00:00.000Z',
        }}
        slots={[
          {
            slotId: 'slot-1',
            label: 'Morning slot',
            startTime: '2027-01-04T12:00:00.000Z',
            endTime: '2027-01-04T14:00:00.000Z',
          },
        ]}
        isEditable
        isOnline
        onSave={vi.fn()}
        saveState="idle"
      />,
      { churchTimezone: 'America/Sao_Paulo' },
    );

    // 12:00-14:00 UTC on 4 Jan is 09:00-11:00 in São Paulo (UTC-3) the same
    // day, and 17:30-19:30 in Kolkata (UTC+5:30) — proof this reads the
    // Church Timezone, not the process's ambient ID.
    expect(screen.getByText('04/01/2027 09:00 – 11:00')).toBeInTheDocument();
  });
});
