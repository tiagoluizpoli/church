import { faker } from '@faker-js/faker';
import { db } from '../../client';
import * as schema from '../../schema';
import { SEED_CONFIG } from '../constants';
import { logStep, logSuccess } from '../utils';
import type { SeededQualifications } from './volunteer.factory';

interface GenerateAssignmentsAndAvailabilityInput {
  volunteers: (typeof schema.volunteer.$inferSelect)[];
  requirements: (typeof schema.slotRequirement.$inferSelect)[];
  links: (typeof schema.ministryVolunteer.$inferSelect)[];
  roles: (typeof schema.role.$inferSelect)[];
  events: (typeof schema.event.$inferSelect)[];
  participations: (typeof schema.ministryParticipation.$inferSelect)[];
  qualifications: SeededQualifications;
}

export async function generateAssignmentsAndAvailability({
  volunteers,
  requirements,
  links,
  roles,
  events,
  participations,
  qualifications,
}: GenerateAssignmentsAndAvailabilityInput) {
  logStep('Generating assignments and availability...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 7);

  const assignmentsData: (typeof schema.assignment.$inferInsert)[] = [];

  // Availability is available-by-default in the reshaped model. Only explicit
  // unavailability marks are stored, so the general demo seed needs none.
  for (const req of requirements) {
    const role = roles.find((r) => r.id === req.roleId);
    if (!role?.ministryId) continue;

    // Members of this ministry who are actually qualified for the required
    // role. Assigning an unqualified member would seed data the builder itself
    // would reject, so every seeded assignment stays conflict-free.
    const eligibleLinks = links.filter(
      (l) =>
        l.ministryId === role.ministryId &&
        (qualifications.get(l.id) ?? []).includes(req.roleId),
    );
    if (eligibleLinks.length === 0) continue;

    // Determine how many to assign (0 to requiredCount)
    const toAssign = faker.number.int({ min: 0, max: req.requiredCount });
    const selectedLinks = faker.helpers
      .arrayElements(eligibleLinks, {
        min: 0,
        max: Math.min(toAssign, eligibleLinks.length),
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const link of selectedLinks) {
      if (!volunteers.some(({ id }) => id === link.volunteerId)) continue;

      const exists = assignmentsData.some(
        (assignment) =>
          assignment.shiftId === req.shiftId &&
          assignment.volunteerId === link.volunteerId,
      );
      if (exists) continue;

      assignmentsData.push({
        id: faker.string.uuid(),
        churchId: req.churchId,
        participationId: req.participationId,
        shiftId: req.shiftId,
        volunteerId: link.volunteerId,
        roleId: req.roleId,
        status: faker.helpers.arrayElement(['confirmed', 'pending'] as const),
      });
    }
  }

  if (assignmentsData.length > 0) {
    await db.insert(schema.assignment).values(assignmentsData);
  }

  const checksData: (typeof schema.availabilityCheck.$inferInsert)[] = [];
  const seenChecks = new Set<string>();
  for (const link of links) {
    const ministryParticipations = participations.filter(
      ({ ministryId }) => ministryId === link.ministryId,
    );
    for (const participation of ministryParticipations) {
      const cycleId = events.find(
        ({ id }) => id === participation.eventId,
      )?.planningCycleId;
      if (!cycleId) continue;
      const key = `${cycleId}:${link.id}`;
      if (seenChecks.has(key)) continue;
      seenChecks.add(key);
      checksData.push({
        id: faker.string.uuid(),
        churchId: link.churchId,
        planningCycleId: cycleId,
        ministryVolunteerId: link.id,
      });
    }
  }

  const checks = checksData.length
    ? await db.insert(schema.availabilityCheck).values(checksData).returning()
    : [];
  const marks = checks.flatMap((check, index) => {
    if (index % 3 !== 0) return [];
    const membership = links.find(({ id }) => id === check.ministryVolunteerId);
    const participation = participations.find(
      ({ ministryId }) => ministryId === membership?.ministryId,
    );
    const requirement = requirements.find(
      ({ participationId }) => participationId === participation?.id,
    );
    return requirement
      ? [
          {
            id: faker.string.uuid(),
            churchId: check.churchId,
            availabilityCheckId: check.id,
            shiftId: requirement.shiftId,
          },
        ]
      : [];
  });
  if (marks.length) await db.insert(schema.availability).values(marks);

  logSuccess(
    `Generated ${assignmentsData.length} assignments, ${checks.length} checks, and ${marks.length} unavailability marks.`,
  );
}
