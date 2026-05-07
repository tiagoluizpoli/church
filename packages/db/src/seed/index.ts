import { env } from '@base-fullstack-template/env/server';
import { faker } from '@faker-js/faker';
import { db } from '../index';
import * as schema from '../schema';

export async function resetDatabase() {
  if (env.NODE_ENV === 'production') {
    throw new Error('🚫 Cannot reset database in production environment');
  }

  console.log('🔄 Resetting database...');

  // Delete in reverse order of dependencies using Drizzle native methods
  await db.delete(schema.ministryInvitation);
  await db.delete(schema.assignmentAudit);
  await db.delete(schema.availability);
  await db.delete(schema.assignment);
  await db.delete(schema.slotRequirement);
  await db.delete(schema.timeSlot);
  await db.delete(schema.event);
  await db.delete(schema.ministryVolunteer);
  await db.delete(schema.team);
  await db.delete(schema.role);
  await db.delete(schema.ministry);
  await db.delete(schema.volunteer);
  await db.delete(schema.church);
  await db.delete(schema.session);
  await db.delete(schema.account);
  await db.delete(schema.verification);
  await db.delete(schema.user);
  await db.delete(schema.todo);

  console.log('✨ Database reset complete.');
}

/**
 * Factory to generate baseline churches
 */
async function generateChurches() {
  console.log('🏛️ Generating churches...');

  const churches = [
    { name: 'Grace Community', slug: 'grace-community' },
    { name: 'Hope City', slug: 'hope-city' },
    { name: 'First Baptist', slug: 'first-baptist' },
  ];

  const insertedChurches = await db
    .insert(schema.church)
    .values(
      churches.map((c) => ({
        id: faker.string.uuid(),
        name: c.name,
        slug: c.slug,
        settings: {},
      })),
    )
    .returning();

  return insertedChurches;
}

/**
 * Factory to generate ministries and teams for churches
 */
async function generateMinistriesAndTeams(
  churches: (typeof schema.church.$inferSelect)[],
) {
  console.log('📂 Generating ministries and teams...');

  const ministriesData: (typeof schema.ministry.$inferInsert)[] = [];
  const standardMinistries = ['Worship', 'Kids', 'Tech', 'Hospitality'];

  for (const church of churches) {
    for (const mName of standardMinistries) {
      ministriesData.push({
        id: faker.string.uuid(),
        churchId: church.id,
        name: mName,
        description: `Standard ${mName} ministry for ${church.name}`,
        enforcementType: 'soft',
      });
    }
  }

  const insertedMinistries = await db
    .insert(schema.ministry)
    .values(ministriesData)
    .returning();

  const teamsData: (typeof schema.team.$inferInsert)[] = [];
  for (const m of insertedMinistries) {
    teamsData.push({
      id: faker.string.uuid(),
      churchId: m.churchId,
      ministryId: m.id,
      name: 'Main Team',
    });
  }

  const insertedTeams = await db
    .insert(schema.team)
    .values(teamsData)
    .returning();

  return { ministries: insertedMinistries, teams: insertedTeams };
}

/**
 * Factory to generate roles for ministries
 */
async function generateRoles(
  ministries: (typeof schema.ministry.$inferSelect)[],
) {
  console.log('🎭 Generating roles...');

  const rolesData: (typeof schema.role.$inferInsert)[] = [];
  const ministryRoles: Record<string, string[]> = {
    Worship: ['Leader', 'Guitarist', 'Vocalist', 'Pianist'],
    Kids: ['Teacher', 'Assistant'],
    Tech: ['Sound', 'Visuals', 'Camera'],
    Hospitality: ['Greeter', 'Usher'],
  };

  for (const m of ministries) {
    const roles = ministryRoles[m.name] || ['Volunteer'];
    for (const rName of roles) {
      rolesData.push({
        id: faker.string.uuid(),
        churchId: m.churchId,
        ministryId: m.id,
        name: rName,
        isGlobal: false,
      });
    }
  }

  const insertedRoles = await db
    .insert(schema.role)
    .values(rolesData)
    .returning();

  return insertedRoles;
}

/**
 * Factory to generate volunteers and map them to ministries
 */
async function generateVolunteers(
  churches: (typeof schema.church.$inferSelect)[],
  ministries: (typeof schema.ministry.$inferSelect)[],
  teams: (typeof schema.team.$inferSelect)[],
) {
  console.log('👥 Generating volunteers...');

  const usersData: (typeof schema.user.$inferInsert)[] = [];
  const volunteersData: (typeof schema.volunteer.$inferInsert)[] = [];

  for (const church of churches) {
    // Generate 15 volunteers per church
    for (let i = 0; i < 15; i++) {
      const userId = faker.string.uuid();
      const volunteerId = faker.string.uuid();
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();

      usersData.push({
        id: userId,
        name: `${firstName} ${lastName}`,
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        emailVerified: true,
      });

      volunteersData.push({
        id: volunteerId,
        userId: userId,
        churchId: church.id,
        status: 'active',
      });
    }
  }

  const insertedUsers = await db
    .insert(schema.user)
    .values(usersData)
    .returning();
  const insertedVolunteers = await db
    .insert(schema.volunteer)
    .values(volunteersData)
    .returning();

  const ministryVolunteersData: (typeof schema.ministryVolunteer.$inferInsert)[] =
    [];

  for (const v of insertedVolunteers) {
    // Pick 1-2 ministries for this church
    const churchMinistries = ministries.filter(
      (m) => m.churchId === v.churchId,
    );
    const selectedMinistries = faker.helpers.arrayElements(churchMinistries, {
      min: 1,
      max: 2,
    });

    for (const m of selectedMinistries) {
      const ministryTeam = teams.find((t) => t.ministryId === m.id);
      ministryVolunteersData.push({
        id: faker.string.uuid(),
        churchId: v.churchId,
        volunteerId: v.id,
        ministryId: m.id,
        teamId: ministryTeam?.id,
        systemRole: 'volunteer',
        status: 'active',
      });
    }
  }

  const insertedLinks = await db
    .insert(schema.ministryVolunteer)
    .values(ministryVolunteersData)
    .returning();

  return {
    users: insertedUsers,
    volunteers: insertedVolunteers,
    links: insertedLinks,
  };
}

/**
 * Factory to generate events for ministries
 */
async function generateEvents(
  ministries: (typeof schema.ministry.$inferSelect)[],
) {
  console.log('📅 Generating events...');

  const eventsData: (typeof schema.event.$inferInsert)[] = [];
  const now = new Date('2026-05-01T00:00:00Z');

  for (const m of ministries) {
    // Generate 8 events per ministry: 2 past, 6 future
    const ministryTitles: Record<string, string[]> = {
      Worship: ['Sunday Morning Service', 'Worship Night', 'Choir Rehearsal'],
      Kids: ['Sunday School', 'VBS Planning', 'Nursery Care'],
      Tech: ['Sunday Production', 'Equipment Maintenance', 'Live Stream Prep'],
      Hospitality: ['Greeter Training', 'New Members Lunch', 'Communion Prep'],
    };

    const titles = ministryTitles[m.name] || ['Special Event'];

    // 2 Past Events
    for (let i = 0; i < 2; i++) {
      const start = faker.date.recent({ days: 30, refDate: now });
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2 hours duration
      eventsData.push({
        id: faker.string.uuid(),
        churchId: m.churchId,
        ministryId: m.id,
        title: faker.helpers.arrayElement(titles),
        description: faker.lorem.sentence(),
        location: 'Main Sanctuary',
        startDate: start,
        endDate: end,
        status: 'published',
      });
    }

    // 6 Future Events
    for (let i = 0; i < 6; i++) {
      const start = faker.date.soon({ days: 90, refDate: now });
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2 hours duration
      eventsData.push({
        id: faker.string.uuid(),
        churchId: m.churchId,
        ministryId: m.id,
        title: faker.helpers.arrayElement(titles),
        description: faker.lorem.sentence(),
        location: 'Main Sanctuary',
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

  return insertedEvents;
}

/**
 * Factory to generate slots and requirements for events
 */
async function generateSlotsAndRequirements(
  events: (typeof schema.event.$inferSelect)[],
  roles: (typeof schema.role.$inferSelect)[],
) {
  console.log('⏰ Generating slots and requirements...');

  const slotsData: (typeof schema.timeSlot.$inferInsert)[] = [];
  const requirementsData: (typeof schema.slotRequirement.$inferInsert)[] = [];

  for (const event of events) {
    // 1. Main Slot
    const mainSlotId = faker.string.uuid();
    slotsData.push({
      id: mainSlotId,
      churchId: event.churchId,
      eventId: event.id,
      label: 'Main Session',
      startTime: event.startDate,
      endTime: event.endDate,
    });

    // 2. Setup Slot (50% chance)
    let setupSlotId: string | undefined;
    if (faker.datatype.boolean(0.5)) {
      setupSlotId = faker.string.uuid();
      const setupStart = new Date(event.startDate.getTime() - 60 * 60 * 1000); // 1 hour before
      slotsData.push({
        id: setupSlotId,
        churchId: event.churchId,
        eventId: event.id,
        label: 'Setup & Prep',
        startTime: setupStart,
        endTime: event.startDate,
      });
    }

    // Generate requirements for each slot
    const ministryRoles = roles.filter(
      (r) => r.ministryId === event.ministryId,
    );
    const slotsToProcess = [mainSlotId, setupSlotId].filter(
      Boolean,
    ) as string[];

    for (const slotId of slotsToProcess) {
      for (const role of ministryRoles) {
        requirementsData.push({
          id: faker.string.uuid(),
          churchId: event.churchId,
          slotId: slotId,
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

  const insertedRequirements = await db
    .insert(schema.slotRequirement)
    .values(requirementsData)
    .returning();

  return { slots: insertedSlots, requirements: insertedRequirements };
}

/**
 * Main seeding logic
 */
export async function seedDatabase() {
  console.log('⏳ Seeding data...');

  // Initialize deterministic seeder
  faker.seed(12345);

  // 🏛️ Church generation
  const churches = await generateChurches();
  console.log(`✅ Generated ${churches.length} churches.`);

  // 📂 Ministry and Team generation
  const { ministries, teams } = await generateMinistriesAndTeams(churches);
  console.log(
    `✅ Generated ${ministries.length} ministries and ${teams.length} teams.`,
  );

  // 🎭 Role generation
  const roles = await generateRoles(ministries);
  console.log(`✅ Generated ${roles.length} roles.`);

  // 👥 Volunteer generation
  const { volunteers } = await generateVolunteers(churches, ministries, teams);
  console.log(`✅ Generated ${volunteers.length} volunteers.`);

  // 📅 Event generation
  const events = await generateEvents(ministries);
  console.log(`✅ Generated ${events.length} events.`);

  // ⏰ Slot and Requirement generation
  const { slots, requirements } = await generateSlotsAndRequirements(
    events,
    roles,
  );
  console.log(
    `✅ Generated ${slots.length} slots and ${requirements.length} requirements.`,
  );

  console.log('✨ Database seeding complete.');
}

async function main() {
  const args = process.argv.slice(2);
  const isReset = args.includes('--reset');

  console.log('🌱 Starting database seeder...');

  if (env.NODE_ENV === 'production') {
    console.error('🚫 Cannot run seeder in production environment');
    process.exit(1);
  }

  // Note: Environment is automatically validated on import from @base-fullstack-template/env/server
  console.log('🎲 Initializing deterministic seed...');

  try {
    if (isReset) {
      await resetDatabase();
    }

    await seedDatabase();

    console.log('✅ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:');
    console.error(error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
