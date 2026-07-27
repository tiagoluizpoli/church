import * as schema from '@church/db';
import {
  addChurchMember,
  churchAdmin,
  createChurch,
  event,
  eventTemplate,
  ministry,
  ministryParticipation,
  ministryVolunteer,
  planningCycle,
  timeBlock,
  timeSlot,
  user,
  volunteer,
} from '@church/db';
import { getTestDatabaseUrl } from '@church/db/test-database-url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const DATABASE_URL = getTestDatabaseUrl();

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
export const schedulingTestDb = drizzle(pool, { schema });

export interface SchedulingPhase3Seed {
  churchAId: string;
  churchBId: string;
  churchATimezone: string;
  adminUserId: string;
  adminVolunteerId: string;
  ministryAId: string;
  ministryBId: string;
}

export interface CreatePhase3CycleInput {
  churchId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  state?: 'draft' | 'locked' | 'archived';
}

export interface CreatePhase3TemplateInput {
  churchId: string;
  name: string;
  weekday: number;
  blocks: Array<{
    label: string;
    startTime: string;
    endTime: string;
    order: number;
  }>;
}

// Roots at `organization`, not `church`: see the note on `truncateAll` in
// `tests/integration/repositories/setup.ts`.
export async function resetSchedulingPhase3Db(): Promise<void> {
  await schedulingTestDb.execute(`
    TRUNCATE TABLE organization, "user" RESTART IDENTITY CASCADE
  `);
}

export async function seedSchedulingPhase3Base(): Promise<SchedulingPhase3Seed> {
  await schedulingTestDb.insert(user).values({
    id: 'sched-admin-user',
    name: 'Scheduling Admin',
    email: 'sched-admin@test.com',
    emailVerified: true,
  });

  const churchA = await createChurch({
    db: schedulingTestDb,
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Scheduling Church A',
    slug: 'scheduling-church-a',
    timezone: 'America/Sao_Paulo',
  });
  const churchB = await createChurch({
    db: schedulingTestDb,
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Scheduling Church B',
    slug: 'scheduling-church-b',
    timezone: 'America/New_York',
  });

  await schedulingTestDb.insert(churchAdmin).values({
    churchId: churchA.id,
    userId: 'sched-admin-user',
  });

  await addChurchMember({
    db: schedulingTestDb,
    churchId: churchA.id,
    userId: 'sched-admin-user',
    accessLevel: 'admin',
  });

  const [adminVolunteer] = await schedulingTestDb
    .insert(volunteer)
    .values({
      id: '44444444-4444-4444-8444-444444444444',
      churchId: churchA.id,
      userId: 'sched-admin-user',
      status: 'active',
    })
    .returning();

  const [ministryA, ministryB] = await schedulingTestDb
    .insert(ministry)
    .values([
      {
        id: '33333333-3333-4333-8333-333333333331',
        churchId: churchA.id,
        name: 'Scheduling Ministry A',
      },
      {
        id: '33333333-3333-4333-8333-333333333332',
        churchId: churchB.id,
        name: 'Scheduling Ministry B',
      },
    ])
    .returning();

  if (!adminVolunteer || !ministryA || !ministryB) {
    throw new Error('Scheduling phase 3 admin/ministry seed failed');
  }

  await schedulingTestDb.insert(ministryVolunteer).values({
    churchId: churchA.id,
    ministryId: ministryA.id,
    volunteerId: adminVolunteer.id,
    systemRole: 'leader',
    status: 'active',
  });

  return {
    churchAId: churchA.id,
    churchBId: churchB.id,
    churchATimezone: churchA.timezone,
    adminUserId: 'sched-admin-user',
    adminVolunteerId: adminVolunteer.id,
    ministryAId: ministryA.id,
    ministryBId: ministryB.id,
  };
}

export async function createSchedulingPhase3Cycle(
  input: CreatePhase3CycleInput,
) {
  const [cycle] = await schedulingTestDb
    .insert(planningCycle)
    .values({
      churchId: input.churchId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      state: input.state ?? 'draft',
    })
    .returning();

  if (!cycle) {
    throw new Error('Scheduling phase 3 cycle seed failed');
  }

  return cycle;
}

export async function createSchedulingPhase3Template(
  input: CreatePhase3TemplateInput,
) {
  const [template] = await schedulingTestDb
    .insert(eventTemplate)
    .values({
      churchId: input.churchId,
      name: input.name,
      weekday: input.weekday,
    })
    .returning();

  if (!template) {
    throw new Error('Scheduling phase 3 template seed failed');
  }

  const blocks =
    input.blocks.length === 0
      ? []
      : await schedulingTestDb
          .insert(timeBlock)
          .values(
            input.blocks.map((block) => ({
              churchId: input.churchId,
              templateId: template.id,
              label: block.label,
              startTime: block.startTime,
              endTime: block.endTime,
              order: block.order,
            })),
          )
          .returning();

  return {
    template,
    blocks,
  };
}

export async function createSchedulingPhase3EventGraph(input: {
  churchId: string;
  cycleId: string;
  ministryId: string;
  sourceTemplateId?: string;
  title: string;
  startDate: Date;
  endDate: Date;
  status?: 'draft' | 'scheduled' | 'cancelled' | 'past';
  sourceTemplateBlockId?: string;
}) {
  const [planningEvent] = await schedulingTestDb
    .insert(event)
    .values({
      churchId: input.churchId,
      planningCycleId: input.cycleId,
      sourceTemplateId: input.sourceTemplateId ?? null,
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status ?? 'draft',
    })
    .returning();

  if (!planningEvent) {
    throw new Error('Scheduling phase 3 event seed failed');
  }

  const [participation] = await schedulingTestDb
    .insert(ministryParticipation)
    .values({
      churchId: input.churchId,
      ministryId: input.ministryId,
      eventId: planningEvent.id,
    })
    .returning();

  const [slot] = await schedulingTestDb
    .insert(timeSlot)
    .values({
      churchId: input.churchId,
      eventId: planningEvent.id,
      sourceTemplateBlockId: input.sourceTemplateBlockId ?? null,
      startTime: input.startDate,
      endTime: input.endDate,
      label: 'Generated Slot',
    })
    .returning();

  if (!participation || !slot) {
    throw new Error('Scheduling phase 3 event graph seed failed');
  }

  return {
    event: planningEvent,
    participation,
    slot,
  };
}
