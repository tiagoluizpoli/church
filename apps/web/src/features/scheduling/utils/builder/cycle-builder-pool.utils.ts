import type { CycleBuilderData } from '../../hooks/use-cycle-builder';
import type { PoolVolunteer } from '../../hooks/use-volunteer-pool';

export function pool(data: CycleBuilderData): PoolVolunteer[] {
  const result = new Map<string, PoolVolunteer>();
  const roleNameById = new Map(data.roles.map((role) => [role.id, role.name]));
  for (const event of data.events)
    for (const slot of event.slots)
      for (const shift of slot.shifts)
        for (const volunteer of shift.eligibleVolunteers) {
          result.set(volunteer.volunteerId, {
            volunteerId: volunteer.volunteerId,
            volunteerName: volunteer.volunteerName,
            status: volunteer.hasConflict
              ? 'unavailable'
              : volunteer.isAvailable
                ? 'available'
                : 'no_response',
            // Ids with no matching role are dropped rather than shown raw: a
            // uuid on the card would read as a skill name.
            qualifiedRoleNames: volunteer.qualifiedRoleIds
              .map((roleId) => roleNameById.get(roleId))
              .filter((name): name is string => name != null)
              .sort((left, right) => left.localeCompare(right)),
            lastServedAt: volunteer.lastServedAt,
          });
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
