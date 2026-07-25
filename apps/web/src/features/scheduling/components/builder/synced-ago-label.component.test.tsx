import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatSyncedAgo, SyncedAgoLabel } from './synced-ago-label';

const NOW = new Date('2026-07-24T12:00:00.000Z').getTime();

describe('formatSyncedAgo (B-1)', () => {
  it.each([
    { elapsedMs: 0, expected: 'Synced just now' },
    { elapsedMs: 9_000, expected: 'Synced just now' },
    { elapsedMs: 10_000, expected: 'Synced 10s ago' },
    { elapsedMs: 35_000, expected: 'Synced 30s ago' },
    { elapsedMs: 90_000, expected: 'Synced 1m ago' },
    { elapsedMs: 7_200_000, expected: 'Synced 2h ago' },
  ])('renders $elapsedMs ms as "$expected"', ({ elapsedMs, expected }) => {
    expect(formatSyncedAgo({ syncedAt: NOW - elapsedMs, now: NOW })).toBe(
      expected,
    );
  });

  it('never reports a future read as negative', () => {
    expect(formatSyncedAgo({ syncedAt: NOW + 5_000, now: NOW })).toBe(
      'Synced just now',
    );
  });
});

describe('SyncedAgoLabel (B-1)', () => {
  it('renders nothing before the first read lands', () => {
    render(<SyncedAgoLabel />);
    expect(
      screen.queryByTestId('cycle-builder-synced-at'),
    ).not.toBeInTheDocument();
  });

  it('attributes an in-flight background refetch', () => {
    render(<SyncedAgoLabel syncedAt={Date.now()} isRefreshing />);
    expect(screen.getByTestId('cycle-builder-synced-at')).toHaveTextContent(
      'Refreshing…',
    );
  });

  it('reports how long ago the board last synced', () => {
    render(<SyncedAgoLabel syncedAt={Date.now()} />);
    expect(screen.getByTestId('cycle-builder-synced-at')).toHaveTextContent(
      'Synced just now',
    );
  });
});
