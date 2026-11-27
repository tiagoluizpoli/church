import { type TimeOfDay, today, toTimeOfDay } from '@church/time';
import type {
  BlockMatchesInput,
  CompareBlocksInput,
  FilterCycleParticipationInput,
  FilteredCycleParticipation,
} from '../domain/contracts/application/participation-view-filter';
import type { ParticipationEventTimeBlockView } from '../domain/contracts/application/prepare-manager';

/** A served, uncancelled block with a Shift lacking a ShiftRequirement: the prepare list's "needs headcount". */
export function blockNeedsAttention(
  block: ParticipationEventTimeBlockView,
): boolean {
  return (
    block.included &&
    !block.cancelled &&
    block.shifts.some((shift) => shift.flagged)
  );
}

function blockMatches({
  block,
  eventTitle,
  filters,
  timeZone,
}: BlockMatchesInput): boolean {
  const { day, q, timeWindow, needsAttention } = filters;
  const { startTime, endTime, label } = block.eventTimeBlock;
  if (day && today({ instant: startTime, timeZone }) !== day) return false;
  const needle = q?.trim().toLowerCase();
  if (
    needle &&
    !(label ?? '').toLowerCase().includes(needle) &&
    !eventTitle.toLowerCase().includes(needle)
  ) {
    return false;
  }
  if (timeWindow && (timeWindow.start || timeWindow.end)) {
    const { mode, start, end } = timeWindow;
    const within = (time: TimeOfDay) =>
      (!start || time >= start) && (!end || time <= end);
    const startOk = within(toTimeOfDay({ instant: startTime, timeZone }));
    const endOk = within(toTimeOfDay({ instant: endTime, timeZone }));
    if (mode === 'starts' && !startOk) return false;
    if (mode === 'ends' && !endOk) return false;
    if (mode === 'within' && !(startOk && endOk)) return false;
  }
  return !needsAttention || blockNeedsAttention(block);
}

/**
 * Filters the cycle's blocks and orders them totally: blocks by start then id,
 * events by their first matching block's start then id. Day markers and totals
 * ignore the filters, so the day strip and header always describe the cycle.
 */
export function filterCycleParticipation({
  events,
  filters,
  timeZone,
}: FilterCycleParticipationInput): FilteredCycleParticipation {
  const allBlocks = events.flatMap(({ eventTimeBlocks }) => eventTimeBlocks);
  const dayMarkers = [
    ...new Set(
      allBlocks.map(({ eventTimeBlock }) =>
        today({ instant: eventTimeBlock.startTime, timeZone }),
      ),
    ),
  ].sort();

  const matching = events
    .map((eventView) => ({
      ...eventView,
      eventTimeBlocks: eventView.eventTimeBlocks
        .filter((block) =>
          blockMatches({
            block,
            eventTitle: eventView.event.title,
            filters,
            timeZone,
          }),
        )
        .sort((left, right) => compareBlocks({ left, right })),
    }))
    .filter(({ eventTimeBlocks }) => eventTimeBlocks.length > 0)
    .sort((left, right) => {
      const [leftFirst] = left.eventTimeBlocks;
      const [rightFirst] = right.eventTimeBlocks;
      return (
        (leftFirst && rightFirst
          ? compareBlocks({ left: leftFirst, right: rightFirst })
          : 0) || left.event.id.localeCompare(right.event.id)
      );
    });

  return {
    events: matching,
    dayMarkers,
    totalBlocks: allBlocks.length,
    needsAttentionBlocks: allBlocks.filter(blockNeedsAttention).length,
  };
}

function compareBlocks({ left, right }: CompareBlocksInput): number {
  const { startTime: leftStart, id: leftId } = left.eventTimeBlock;
  const { startTime: rightStart, id: rightId } = right.eventTimeBlock;
  return leftStart.localeCompare(rightStart) || leftId.localeCompare(rightId);
}
