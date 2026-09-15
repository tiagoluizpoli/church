import { screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DashboardOfflineBanner } from './dashboard-offline-banner';
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

describe('DashboardOfflineBanner (T157)', () => {
  it('renders the last-updated instant as dd/MM/yyyy HH:mm in the Church Timezone, not the ambient TZ', () => {
    renderWithProviders(
      <DashboardOfflineBanner
        isOffline={false}
        isUsingCachedData
        lastUpdatedAt="2027-01-04T23:15:00.000Z"
        onRefresh={vi.fn()}
        refreshState="idle"
      />,
      { churchTimezone: 'America/Sao_Paulo' },
    );

    // 23:15 UTC on 4 Jan is 20:15 in São Paulo (UTC-3) the same day, and
    // already 4:45 the next day in Kolkata (UTC+5:30) — proof this reads the
    // Church Timezone, not the process's ambient ID.
    expect(
      screen.getByText('Last updated: 04/01/2027 20:15'),
    ).toBeInTheDocument();
  });
});
