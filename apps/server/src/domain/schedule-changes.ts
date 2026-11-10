import { compareInstants, type Instant } from '@church/time';
import type { ScheduleAssignmentSnapshot } from './schedule-last-told';

export type ScheduleChange =
  | { kind: 'added'; assignment: ScheduleAssignmentSnapshot }
  | { kind: 'removed'; assignment: ScheduleAssignmentSnapshot }
  | {
      kind: 'moved';
      before: ScheduleAssignmentSnapshot;
      after: ScheduleAssignmentSnapshot;
    };

interface ScheduleChangesInput {
  before: ScheduleAssignmentSnapshot[];
  after: ScheduleAssignmentSnapshot[];
  at: Instant;
}

/** Net Assignment changes still relevant at the supplied Instant. */
export function scheduleChanges({
  before,
  after,
  at,
}: ScheduleChangesInput): ScheduleChange[] {
  // Cancel identical placements one-to-one before comparing remaining IDs.
  // A replacement or remove/recreate allocates a new ID without changing what
  // this Volunteer was told. Matching per Volunteer also preserves duplicates.
  const reconciledBefore = new Set<ScheduleAssignmentSnapshot>();
  const reconciledAfter = new Set<ScheduleAssignmentSnapshot>();
  for (const previous of before) {
    const equivalent = after.find(
      (current) =>
        !reconciledAfter.has(current) &&
        previous.shiftId === current.shiftId &&
        previous.roleId === current.roleId &&
        previous.sectorId === current.sectorId &&
        previous.startsAt === current.startsAt &&
        previous.endsAt === current.endsAt,
    );
    if (equivalent) {
      reconciledBefore.add(previous);
      reconciledAfter.add(equivalent);
    }
  }
  before = before.filter((item) => !reconciledBefore.has(item));
  after = after.filter((item) => !reconciledAfter.has(item));
  const changes: ScheduleChange[] = [];
  const upcoming = (assignment: ScheduleAssignmentSnapshot) =>
    compareInstants({ left: assignment.startsAt, right: at }) > 0;
  for (const previous of before) {
    const current = after.find(
      (item) => item.assignmentId === previous.assignmentId,
    );
    if (!current || current.shiftId !== previous.shiftId) {
      if (upcoming(previous))
        changes.push({ kind: 'removed', assignment: previous });
    } else if (
      upcoming(previous) &&
      upcoming(current) &&
      // The Assignment's own placement only: a stretched Event moves nobody.
      (previous.startsAt !== current.startsAt ||
        previous.endsAt !== current.endsAt ||
        previous.sectorId !== current.sectorId ||
        previous.roleId !== current.roleId)
    ) {
      changes.push({ kind: 'moved', before: previous, after: current });
    }
  }
  for (const current of after) {
    const previous = before.find(
      (item) => item.assignmentId === current.assignmentId,
    );
    if (
      (!previous || previous.shiftId !== current.shiftId) &&
      upcoming(current)
    ) {
      changes.push({ kind: 'added', assignment: current });
    }
  }
  return changes;
}
