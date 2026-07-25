import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * How often the label re-reads the clock. Coarse on purpose: the number is
 * there to make a background refetch attributable, not to be a stopwatch, and a
 * per-second tick in the toolbar of a dense board is noise.
 */
const SYNCED_AGO_TICK_MS = 10_000;
const SECOND_MS = 1_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

interface FormatSyncedAgoInput {
  syncedAt: number;
  now: number;
}

export function formatSyncedAgo({ syncedAt, now }: FormatSyncedAgoInput) {
  const elapsed = Math.max(now - syncedAt, 0);
  if (elapsed < SYNCED_AGO_TICK_MS) return 'Synced just now';
  if (elapsed < MINUTE_MS) {
    // Floored to the tick so the text never claims a precision the timer does
    // not have.
    const seconds =
      Math.floor(elapsed / SYNCED_AGO_TICK_MS) *
      (SYNCED_AGO_TICK_MS / SECOND_MS);
    return `Synced ${seconds}s ago`;
  }
  if (elapsed < HOUR_MS) {
    return `Synced ${Math.floor(elapsed / MINUTE_MS)}m ago`;
  }
  return `Synced ${Math.floor(elapsed / HOUR_MS)}h ago`;
}

interface SyncedAgoLabelProps {
  /** Epoch ms of the last successful read. Absent before the first one lands. */
  syncedAt?: number;
  isRefreshing?: boolean;
  className?: string;
}

/**
 * The board refetches every 30s and on window focus, so rows can change under a
 * stationary cursor. Without this the leader has no way to tell a board that
 * just refreshed itself from one that has been stale since she made coffee.
 */
export function SyncedAgoLabel({
  syncedAt,
  isRefreshing,
  className,
}: SyncedAgoLabelProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), SYNCED_AGO_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  if (!syncedAt) return null;

  return (
    <span
      className={cn('text-muted-foreground text-xs', className)}
      data-testid="cycle-builder-synced-at"
    >
      {isRefreshing ? 'Refreshing…' : formatSyncedAgo({ syncedAt, now })}
    </span>
  );
}
