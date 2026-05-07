import { faker } from '@faker-js/faker';
import { db } from '../../client';
import * as schema from '../../schema';
import { SEED_CONFIG } from '../constants';
import { logStep, logSuccess } from '../utils';

export async function generateEvents(
  ministries: (typeof schema.ministry.$inferSelect)[],
) {
  logStep('Generating events...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 5);

  const eventsData: (typeof schema.event.$inferInsert)[] = [];
  const referenceDate = new Date(SEED_CONFIG.REFERENCE_DATE);

  for (const m of ministries) {
    const titles = SEED_CONFIG.MINISTRY_ROLES[m.name] || ['Special Event'];

    // Past Events
    for (let i = 0; i < SEED_CONFIG.EVENTS_PER_MINISTRY.PAST; i++) {
      const start = faker.date.recent({ days: 30, refDate: referenceDate });
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      eventsData.push({
        id: faker.string.uuid(),
        churchId: m.churchId,
        ministryId: m.id,
        title: `${m.name} ${faker.helpers.arrayElement(titles)}`,
        description: faker.lorem.sentence(),
        location: SEED_CONFIG.DEFAULT_LOCATION,
        startDate: start,
        endDate: end,
        status: 'published',
      });
    }

    // Future Events
    for (let i = 0; i < SEED_CONFIG.EVENTS_PER_MINISTRY.FUTURE; i++) {
      const start = faker.date.soon({ days: 90, refDate: referenceDate });
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      eventsData.push({
        id: faker.string.uuid(),
        churchId: m.churchId,
        ministryId: m.id,
        title: `${m.name} ${faker.helpers.arrayElement(titles)}`,
        description: faker.lorem.sentence(),
        location: SEED_CONFIG.DEFAULT_LOCATION,
        startDate: start,
        endDate: end,
        status: 'published',
      });
    }
  }

  const insertedEvents = await db
    .insert(schema.event)
    .values(eventsData)
    .returning();

  const sortedEvents = [...insertedEvents].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  logSuccess(`Generated ${sortedEvents.length} events.`);
  return sortedEvents;
}

export async function generateSlotsAndRequirements(
  events: (typeof schema.event.$inferSelect)[],
  roles: (typeof schema.role.$inferSelect)[],
) {
  logStep('Generating slots and requirements...');
  faker.seed(SEED_CONFIG.GLOBAL_SEED + 6);

  const slotsData: (typeof schema.timeSlot.$inferInsert)[] = [];
  const requirementsData: (typeof schema.slotRequirement.$inferInsert)[] = [];

  for (const event of events) {
    const mainSlotId = faker.string.uuid();
    slotsData.push({
      id: mainSlotId,
      churchId: event.churchId,
      eventId: event.id,
      label: 'Main Session',
      startTime: event.startDate,
      endTime: event.endDate,
    });

    // Setup Slot (50% chance)
    if (faker.datatype.boolean(0.5)) {
      const setupSlotId = faker.string.uuid();
      const setupStart = new Date(event.startDate.getTime() - 60 * 60 * 1000);
      slotsData.push({
        id: setupSlotId,
        churchId: event.churchId,
        eventId: event.id,
        label: 'Setup & Prep',
        startTime: setupStart,
        endTime: event.startDate,
      });
    }

    const ministryRoles = roles.filter(
      (r) => r.ministryId === event.ministryId,
    );

    // Get slots for this event that we just created locally
    const eventSlots = slotsData.filter((s) => s.eventId === event.id);

    for (const slot of eventSlots) {
      for (const role of ministryRoles) {
        requirementsData.push({
          id: faker.string.uuid(),
          churchId: event.churchId,
          slotId: slot.id as string,
          roleId: role.id,
          requiredCount: faker.number.int({ min: 1, max: 2 }),
        });
      }
    }
  }

  const insertedSlots = await db
    .insert(schema.timeSlot)
    .values(slotsData)
    .returning();

  const sortedSlots = [...insertedSlots].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const insertedRequirements = await db
    .insert(schema.slotRequirement)
    .values(requirementsData)
    .returning();

  const sortedRequirements = [...insertedRequirements].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  logSuccess(
    `Generated ${sortedSlots.length} slots and ${sortedRequirements.length} requirements.`,
  );
  return { slots: sortedSlots, requirements: sortedRequirements };
}
