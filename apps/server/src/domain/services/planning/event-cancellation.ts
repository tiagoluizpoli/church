import { NotFoundError } from '@church/core';
import { compareInstants } from '@church/time';
import type { MinistryId } from '../../branded-ids';
import { AdminCancellationWindowClosedError } from '../../errors/admin-cancellation-window-closed';
import { IllegalStateTransitionError } from '../../errors/illegal-state-transition';
import type {
  CancellationImpact,
  ResolveCancellationScopeInput,
  ResolvedCancellationScope,
  SummarizeCancellationImpactInput,
} from './event-cancellation.types';

/**
 * Resolves the scope's own bounds and refuses a block of another Event (404),
 * an already-cancelled block and a scope at or after its own start: a future
 * block stays cancellable while a sibling has started. Pure.
 */
export function resolveCancellationScope({
  scope,
  event,
  eventTimeBlocks,
  now,
}: ResolveCancellationScopeInput): ResolvedCancellationScope {
  let resolved: ResolvedCancellationScope;
  if (scope.kind === 'event') {
    const activeIds = eventTimeBlocks
      .filter(({ status }) => status === 'active')
      .map(({ id }) => id);
    resolved = {
      start: event.start,
      end: event.end,
      eventTimeBlockIds: activeIds,
    };
  } else {
    const { eventTimeBlockId } = scope;
    const block = eventTimeBlocks.find(({ id }) => id === eventTimeBlockId);
    if (!block) {
      throw new NotFoundError(`EventTimeBlock not found: ${eventTimeBlockId}`);
    }
    if (block.status !== 'active') {
      throw new IllegalStateTransitionError({
        from: block.status,
        to: 'cancel',
      });
    }
    resolved = {
      start: block.startTime,
      end: block.endTime,
      eventTimeBlockIds: [block.id],
    };
  }

  if (compareInstants({ left: now, right: resolved.start }) >= 0) {
    throw new AdminCancellationWindowClosedError();
  }
  return resolved;
}

export function summarizeCancellationImpact({
  scope,
  event,
  resolved: { start, end },
  assignments,
  ministries,
}: SummarizeCancellationImpactInput): CancellationImpact {
  const published = assignments.filter((row) => row.published);
  const toldIn = (ministryId: MinistryId) =>
    new Set(
      published
        .filter((row) => row.ministryId === ministryId)
        .map(({ volunteerId }) => volunteerId),
    ).size;
  const rows = ministries.map(({ id, name }) => ({
    ministryId: id,
    ministryName: name,
    volunteerCount: toldIn(id),
  }));
  const told = new Set(published.map(({ volunteerId }) => volunteerId));
  return {
    scope,
    eventId: event.id,
    eventTitle: event.title,
    start,
    end,
    volunteerCount: told.size,
    ministryCount: rows.filter(({ volunteerCount }) => volunteerCount > 0)
      .length,
    ministries: rows,
    openSwapRequestCount: assignments.filter((row) => row.openSwapRequest)
      .length,
  };
}
