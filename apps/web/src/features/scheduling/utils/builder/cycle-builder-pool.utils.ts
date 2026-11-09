import type {
  CycleBuilderData,
  CycleBuilderShiftSummary,
} from '../../hooks/use-cycle-builder';
import type { PoolVolunteer } from '../../hooks/use-volunteer-pool';
import { conflictReason } from './cycle-builder-conflict.utils';

interface PoolInput {
  data: CycleBuilderData;
  shift?: CycleBuilderShiftSummary;
  timeZone: string;
}

export function pool({ data, shift, timeZone }: PoolInput): PoolVolunteer[] {
  const result = new Map<string, PoolVolunteer>();
  const roleNameById = new Map(data.roles.map((role) => [role.id, role.name]));
  for (const event of data.events)
    for (const eventTimeBlock of event.eventTimeBlocks)
      for (const shift of eventTimeBlock.shifts)
        for (const volunteer of shift.eligibleVolunteers) {
          result.set(volunteer.volunteerId, {
            volunteerId: volunteer.volunteerId,
            volunteerName: volunteer.volunteerName,
            status: volunteer.answerState,
            // Ids with no matching role are dropped rather than shown raw: a
            // uuid on the card would read as a skill name.
            qualifiedRoleNames: volunteer.qualifiedRoleIds
              .map((roleId) => roleNameById.get(roleId))
              .filter((name): name is string => name != null)
              .sort((left, right) => left.localeCompare(right)),
            lastServedAt: volunteer.lastServedAt,
          });
        }
  if (shift) {
    for (const volunteer of shift.eligibleVolunteers) {
      const existing = result.get(volunteer.volunteerId);
      if (!existing) continue;
      const { conflict } = volunteer;
      result.set(volunteer.volunteerId, {
        ...existing,
        status: volunteer.answerState,
        conflictReason: conflictReason({ conflict, timeZone }),
      });
    }
  }
  for (const assignment of data.assignments)
    if (!result.has(assignment.volunteerId))
      result.set(assignment.volunteerId, {
        volunteerId: assignment.volunteerId,
        volunteerName: assignment.volunteerName ?? assignment.volunteerId,
        status: 'no_response',
      });
  return [...result.values()];
}
