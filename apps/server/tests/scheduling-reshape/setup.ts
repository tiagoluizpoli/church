import * as schema from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { fromDate, fromDateColumn } from '@church/time';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {
  buildChurch,
  buildChurchMembership,
} from '../../seeds/builders/church';
import { buildUser } from '../../seeds/builders/identity';
import { buildMinistry } from '../../seeds/builders/ministry';
import {
  buildEvent,
  buildEventTemplate,
  buildMinistryParticipation,
  buildPlanningCycle,
  buildTimeSlot,
} from '../../seeds/builders/scheduling';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '../../seeds/builders/volunteer';

const DATABASE_URL = getIntegrationDatabaseUrl();

export const schedulingTestPool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 3,
});
export const schedulingTestDb = drizzle(schedulingTestPool, { schema });

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

export interface CreatePhase3EventGraphInput {
  churchId: string;
  cycleId: string;
  ministryId: string;
  sourceTemplateId?: string;
  title: string;
  start: Date;
  end: Date;
  status?: 'draft' | 'scheduled' | 'cancelled' | 'past';
  sourceTemplateBlockId?: string;
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
  const adminUserId = 'sched-admin-user';

  await buildUser({
    db: schedulingTestDb,
    id: adminUserId,
    name: 'Scheduling Admin',
    email: 'sched-admin@test.com',
  });

  const churchA = await buildChurch({
    db: schedulingTestDb,
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Scheduling Church A',
    slug: 'scheduling-church-a',
    timezone: 'America/Sao_Paulo',
  });
  const churchB = await buildChurch({
    db: schedulingTestDb,
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Scheduling Church B',
    slug: 'scheduling-church-b',
    timezone: 'America/New_York',
  });

  await buildChurchMembership({
    db: schedulingTestDb,
    churchId: churchA.id,
    userId: adminUserId,
    accessLevel: 'admin',
  });

  const adminVolunteer = await buildVolunteer({
    db: schedulingTestDb,
    id: '44444444-4444-4444-8444-444444444444',
    churchId: churchA.id,
    userId: adminUserId,
  });

  const ministryA = await buildMinistry({
    db: schedulingTestDb,
    id: '33333333-3333-4333-8333-333333333331',
    churchId: churchA.id,
    name: 'Scheduling Ministry A',
  });
  const ministryB = await buildMinistry({
    db: schedulingTestDb,
    id: '33333333-3333-4333-8333-333333333332',
    churchId: churchB.id,
    name: 'Scheduling Ministry B',
  });

  await buildMinistryMembership({
    db: schedulingTestDb,
    churchId: churchA.id,
    ministryId: ministryA.id,
    volunteerId: adminVolunteer.id,
    id: '44444444-4444-4444-8444-4444444444a1',
    ministryAccessLevel: 'leader',
    roleIds: [],
    teams: [],
  });

  return {
    churchAId: churchA.id,
    churchBId: churchB.id,
    churchATimezone: churchA.timezone,
    adminUserId,
    adminVolunteerId: adminVolunteer.id,
    ministryAId: ministryA.id,
    ministryBId: ministryB.id,
  };
}

export async function createSchedulingPhase3Cycle(
  input: CreatePhase3CycleInput,
) {
  return await buildPlanningCycle({
    db: schedulingTestDb,
    churchId: input.churchId,
    name: input.name,
    startDate: fromDateColumn({ date: input.startDate }),
    endDate: fromDateColumn({ date: input.endDate }),
    state: input.state ?? 'draft',
  });
}

export async function createSchedulingPhase3Template(
  input: CreatePhase3TemplateInput,
) {
  return await buildEventTemplate({
    db: schedulingTestDb,
    churchId: input.churchId,
    name: input.name,
    weekday: input.weekday,
    blocks: input.blocks,
  });
}

export async function createSchedulingPhase3EventGraph(
  input: CreatePhase3EventGraphInput,
) {
  const start = fromDate({ date: input.start });
  const end = fromDate({ date: input.end });

  const planningEvent = await buildEvent({
    db: schedulingTestDb,
    churchId: input.churchId,
    planningCycleId: input.cycleId,
    sourceTemplateId: input.sourceTemplateId,
    title: input.title,
    start,
    end,
    status: input.status ?? 'draft',
  });

  const participation = await buildMinistryParticipation({
    db: schedulingTestDb,
    churchId: input.churchId,
    ministryId: input.ministryId,
    eventId: planningEvent.id,
    state: 'tailoring',
    timeSlotIds: [],
  });

  const slot = await buildTimeSlot({
    db: schedulingTestDb,
    churchId: input.churchId,
    eventId: planningEvent.id,
    sourceTemplateBlockId: input.sourceTemplateBlockId,
    start,
    end,
    label: 'Generated Slot',
  });

  return {
    event: planningEvent,
    participation,
    slot,
  };
}
