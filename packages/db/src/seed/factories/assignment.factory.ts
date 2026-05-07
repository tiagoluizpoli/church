import { faker } from '@faker-js/faker';
import { db } from '../../client';
import * as schema from '../../schema';
import { SEED_CONFIG } from '../constants';
import { logStep, logSuccess } from '../utils';

export async function generateAssignmentsAndAvailability(
  volunteers: (typeof schema.volunteer.$inferSelect)[],
  slots: (typeof schema.timeSlot.$inferSelect)[],
  requirements: (typeof schema.slotRequirement.$inferSelect)[],
  links: (typeof schema.ministryVolunteer.$inferSelect)[],
  roles: (typeof schema.role.$inferSelect)[],
) {
  logStep('Generating assignments and availability...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 7);

  const availabilityData: (typeof schema.availability.$inferInsert)[] = [];
  const assignmentsData: (typeof schema.assignment.$inferInsert)[] = [];

  // 1. Generate Availability
  // We'll generate random availability for a subset of volunteers using slot times as ranges
  for (const v of volunteers) {
    const selectedSlots = faker.helpers
      .arrayElements(slots, {
        min: 1,
        max: 3,
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const slot of selectedSlots) {
      availabilityData.push({
        id: faker.string.uuid(),
        churchId: v.churchId,
        volunteerId: v.id,
        type: faker.helpers.arrayElement(['available', 'unavailable'] as const),
        startTime: slot.startTime,
        endTime: slot.endTime,
        isAllDay: false,
      });
    }
  }

  // 2. Generate Assignments
  // For each requirement, assign volunteers from the correct ministry
  for (const req of requirements) {
    const role = roles.find((r) => r.id === req.roleId);
    if (!role?.ministryId) continue;

    // Find volunteers linked to this ministry
    const eligibleLinks = links.filter((l) => l.ministryId === role.ministryId);
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
      // Avoid duplicate assignments for the same slot and volunteer
      const exists = assignmentsData.some(
        (a) => a.slotId === req.slotId && a.volunteerId === link.volunteerId,
      );
      if (exists) continue;

      assignmentsData.push({
        id: faker.string.uuid(),
        churchId: req.churchId,
        slotId: req.slotId,
        volunteerId: link.volunteerId,
        roleId: req.roleId,
        status: faker.helpers.arrayElement(['confirmed', 'pending'] as const),
      });
    }
  }

  // Batch insert
  if (availabilityData.length > 0) {
    await db.insert(schema.availability).values(availabilityData);
  }

  if (assignmentsData.length > 0) {
    await db.insert(schema.assignment).values(assignmentsData);
  }

  logSuccess(
    `Generated ${availabilityData.length} availability records and ${assignmentsData.length} assignments.`,
  );
}
