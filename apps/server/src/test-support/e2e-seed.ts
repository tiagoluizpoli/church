import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '@church/db';
import {
  assignment,
  availability,
  availabilityCheck,
  church,
  churchAdmin,
  event,
  ministry,
  ministryParticipation,
  ministryVolunteer,
  planningCycle,
  role,
  shift,
  slotRequirement,
  team,
  timeSlot,
  user,
  volunteer,
  volunteerNotification,
} from '@church/db';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const e2eAuthDirectory = path.resolve(workspaceRoot, 'apps/web/tests/.auth');

export const CHURCH_ADMIN_STORAGE_STATE = path.resolve(
  e2eAuthDirectory,
  'church-admin.json',
);
export const LEADER_STORAGE_STATE = path.resolve(
  e2eAuthDirectory,
  'leader.json',
);
export const VOLUNTEER_STORAGE_STATE = path.resolve(
  e2eAuthDirectory,
  'volunteer.json',
);

/**
 * E2E domain seed (T126). Lives in `apps/server` because the frontend package
 * must not depend on DB tooling. Invoked from the web Playwright `globalSetup`
 * via shell-out:
 *   bun run --cwd apps/server seed:e2e -- --leader-user-id=<id>
 *     --sub-leader-user-id=<id> --volunteer-user-id=<id>
 *
 * Links the leader volunteer to `--leader-user-id` (a real Better Auth user
 * created at sign-up) so `findByUserIdGlobally` resolves it and
 * `authorizeLeaderOrAdmin` grants leader rights over the seeded ministry.
 *
 * Links the sub-leader volunteer to `--sub-leader-user-id` so
 * `authorizeScheduleBuilderAccess` resolves them as a sub_leader of team1.
 */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5444/church';

export const E2E_IDS = {
  church: 'e2e11111-1111-1111-1111-111111111111',
  planningCycle: 'e2e21111-1111-1111-1111-111111111111',
  ministry: 'e2e33333-3333-3333-3333-333333333331',
  ministryCare: 'e2e33333-3333-3333-3333-333333333332',
  leaderVolunteer: 'e2e44444-4444-4444-4444-444444444441',
  schedulingVolunteer: 'e2e44444-4444-4444-4444-444444444442',
  subLeaderVolunteer: 'e2e44444-4444-4444-4444-444444444446',
  team1: 'e2eaaaa1-0000-0000-0000-000000000001',
  careTeam: 'e2eaaaa1-0000-0000-0000-000000000002',
  roleUsher: 'e2e55555-5555-5555-5555-555555555551',
  roleGreeter: 'e2e55555-5555-5555-5555-555555555552',
  roleCareHost: 'e2e55555-5555-5555-5555-555555555553',
  // Primary event — used by US1, US5, smoke, a11y tests.
  event: 'e2e66666-6666-6666-6666-666666666661',
  slot: 'e2e77777-7777-7777-7777-777777777771',
  // Override event — reserved for US2 conflict override journey.
  eventOverride: 'e2e66666-6666-6666-6666-666666666662',
  slotOverride: 'e2e77777-7777-7777-7777-777777777772',
  // Decline event — reserved for US3 volunteer decline journey.
  declineEvent: 'e2e66666-6666-6666-6666-666666666663',
  declineSlot: 'e2e77777-7777-7777-7777-777777777773',
  declineAssignment: 'e2e99999-9999-9999-9999-999999999991',
  // Sub-leader event — reserved for US6 sub-leader journey.
  us6Event: 'e2e66666-6666-6666-6666-666666666664',
  us6Slot: 'e2e77777-7777-7777-7777-777777777774',
  careEvent: 'e2e66666-6666-6666-6666-666666666665',
  careSlot: 'e2e77777-7777-7777-7777-777777777775',
  careAssignment: 'e2e99999-9999-9999-9999-999999999992',
  // Second tenant — used only by the cross-cutting church-isolation spec
  // (DL4-X1). Deliberately minimal: one church, one admin, one locked cycle.
  churchB: 'e2ebbbbb-1111-1111-1111-111111111111',
  churchBAdminVolunteer: 'e2ebbbbb-4444-4444-4444-444444444441',
  churchBPlanningCycle: 'e2ebbbbb-2111-1111-1111-111111111111',
} as const;

export const CHURCH_B_PLANNING_CYCLE_NAME = 'E2E ChurchB Isolated Cycle';

const PARTICIPATION_IDS = {
  [E2E_IDS.event]: 'e2e61111-1111-1111-1111-111111111111',
  [E2E_IDS.eventOverride]: 'e2e61111-1111-1111-1111-111111111112',
  [E2E_IDS.declineEvent]: 'e2e61111-1111-1111-1111-111111111113',
  [E2E_IDS.us6Event]: 'e2e61111-1111-1111-1111-111111111114',
  [E2E_IDS.careEvent]: 'e2e61111-1111-1111-1111-111111111115',
} as const;

const SHIFT_IDS = {
  [E2E_IDS.slot]: 'e2e71111-1111-1111-1111-111111111111',
  [E2E_IDS.slotOverride]: 'e2e71111-1111-1111-1111-111111111112',
  [E2E_IDS.declineSlot]: 'e2e71111-1111-1111-1111-111111111113',
  [E2E_IDS.us6Slot]: 'e2e71111-1111-1111-1111-111111111114',
  [E2E_IDS.careSlot]: 'e2e71111-1111-1111-1111-111111111115',
} as const;

const US4_SHARED_CARE_PARTICIPATION_ID = 'e2e61111-1111-1111-1111-111111111116';
const US4_SHARED_CARE_SHIFT_ID = 'e2e71111-1111-1111-1111-111111111116';

const POOL_VOLUNTEERS = [
  {
    id: 'e2e44444-4444-4444-4444-4444444444a1',
    userId: 'e2e-pool-user-1',
    name: 'Grace Hopper',
    email: 'grace@e2e.test',
    avail: 'available' as const,
    // Grace is in team1 — sub-leader (US6) can see her in sidebar.
    teamId: E2E_IDS.team1,
  },
  {
    id: 'e2e44444-4444-4444-4444-4444444444a2',
    userId: 'e2e-pool-user-2',
    name: 'Ada Lovelace',
    email: 'ada@e2e.test',
    avail: 'available' as const,
    teamId: null,
  },
  {
    id: 'e2e44444-4444-4444-4444-4444444444a3',
    userId: 'e2e-pool-user-3',
    name: 'Alan Turing',
    email: 'alan@e2e.test',
    avail: 'available' as const,
    teamId: null,
  },
  {
    // Conflicted volunteer — marked unavailable for the event window so the
    // override flow (US2) can be exercised end-to-end.
    id: 'e2e44444-4444-4444-4444-4444444444a4',
    userId: 'e2e-pool-user-4',
    name: 'Mallory Knox',
    email: 'mallory@e2e.test',
    avail: 'unavailable' as const,
    teamId: null,
  },
] as const;

function makeDb() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  return { pool, db: drizzle(pool, { schema }) };
}

export interface SeedE2eOptions {
  leaderUserId: string;
  subLeaderUserId: string;
  volunteerUserId: string;
  churchBAdminUserId: string;
}

export async function seedE2e({
  leaderUserId,
  subLeaderUserId,
  volunteerUserId,
  churchBAdminUserId,
}: SeedE2eOptions): Promise<typeof E2E_IDS> {
  const { pool, db } = makeDb();
  try {
    // Pool volunteers need passwordless users for the volunteer.user_id FK.
    await db
      .insert(user)
      .values(
        POOL_VOLUNTEERS.map((poolVolunteer) => ({
          id: poolVolunteer.userId,
          name: poolVolunteer.name,
          email: poolVolunteer.email,
          emailVerified: true,
        })),
      )
      .onConflictDoNothing();

    await db
      .insert(church)
      .values({
        id: E2E_IDS.church,
        name: 'E2E Church',
        slug: 'e2e-church',
        timezone: 'America/New_York',
      })
      .onConflictDoNothing();

    await db
      .insert(churchAdmin)
      .values({ churchId: E2E_IDS.church, userId: leaderUserId })
      .onConflictDoNothing();

    await db
      .insert(planningCycle)
      .values({
        id: E2E_IDS.planningCycle,
        churchId: E2E_IDS.church,
        name: 'E2E December cycle',
        startDate: new Date('2026-12-01T00:00:00Z'),
        endDate: new Date('2027-01-01T00:00:00Z'),
        state: 'locked',
      })
      .onConflictDoNothing();

    // Second tenant (DL4-X1 church isolation, cross-cutting spec only).
    await db
      .insert(church)
      .values({
        id: E2E_IDS.churchB,
        name: 'E2E ChurchB',
        slug: 'e2e-church-b',
        timezone: 'America/Chicago',
      })
      .onConflictDoNothing();

    await db
      .insert(churchAdmin)
      .values({ churchId: E2E_IDS.churchB, userId: churchBAdminUserId })
      .onConflictDoNothing();

    const [churchBAdminVolunteerRow] = await db
      .insert(volunteer)
      .values({
        id: E2E_IDS.churchBAdminVolunteer,
        churchId: E2E_IDS.churchB,
        userId: churchBAdminUserId,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [volunteer.id],
        set: { churchId: E2E_IDS.churchB, userId: churchBAdminUserId },
      })
      .returning({ id: volunteer.id });
    if (!churchBAdminVolunteerRow) {
      throw new Error('Failed to seed the churchB admin volunteer.');
    }

    await db
      .insert(planningCycle)
      .values({
        id: E2E_IDS.churchBPlanningCycle,
        churchId: E2E_IDS.churchB,
        name: CHURCH_B_PLANNING_CYCLE_NAME,
        startDate: new Date('2026-12-01T00:00:00Z'),
        endDate: new Date('2027-01-01T00:00:00Z'),
        state: 'locked',
      })
      .onConflictDoNothing();

    await db
      .insert(ministry)
      .values([
        {
          id: E2E_IDS.ministry,
          churchId: E2E_IDS.church,
          name: 'E2E Worship',
          enforcementType: 'soft',
        },
        {
          id: E2E_IDS.ministryCare,
          churchId: E2E_IDS.church,
          name: 'E2E Care',
          enforcementType: 'soft',
        },
      ])
      .onConflictDoNothing();

    // Team1 — used by US6 sub-leader scoping.
    await db
      .insert(team)
      .values([
        {
          id: E2E_IDS.team1,
          churchId: E2E_IDS.church,
          ministryId: E2E_IDS.ministry,
          name: 'E2E Team Alpha',
        },
        {
          id: E2E_IDS.careTeam,
          churchId: E2E_IDS.church,
          ministryId: E2E_IDS.ministryCare,
          name: 'Care Team',
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(role)
      .values([
        {
          id: E2E_IDS.roleUsher,
          churchId: E2E_IDS.church,
          ministryId: E2E_IDS.ministry,
          name: 'Usher',
          isGlobal: false,
        },
        {
          id: E2E_IDS.roleGreeter,
          churchId: E2E_IDS.church,
          ministryId: E2E_IDS.ministry,
          name: 'Greeter',
          isGlobal: false,
        },
        {
          id: E2E_IDS.roleCareHost,
          churchId: E2E_IDS.church,
          ministryId: E2E_IDS.ministryCare,
          name: 'Care Host',
          isGlobal: false,
        },
      ])
      .onConflictDoNothing();

    const [leaderVolunteerRow] = await db
      .insert(volunteer)
      .values({
        id: E2E_IDS.leaderVolunteer,
        churchId: E2E_IDS.church,
        userId: leaderUserId,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [volunteer.id],
        set: {
          churchId: E2E_IDS.church,
          userId: leaderUserId,
          status: 'active',
        },
      })
      .returning({ id: volunteer.id });

    const [subLeaderVolunteerRow] = await db
      .insert(volunteer)
      .values({
        id: E2E_IDS.subLeaderVolunteer,
        churchId: E2E_IDS.church,
        userId: subLeaderUserId,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [volunteer.id],
        set: {
          churchId: E2E_IDS.church,
          userId: subLeaderUserId,
          status: 'active',
        },
      })
      .returning({ id: volunteer.id });

    const [schedulingVolunteerRow] = await db
      .insert(volunteer)
      .values({
        id: E2E_IDS.schedulingVolunteer,
        churchId: E2E_IDS.church,
        userId: volunteerUserId,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [volunteer.id],
        set: {
          churchId: E2E_IDS.church,
          userId: volunteerUserId,
          status: 'active',
        },
      })
      .returning({ id: volunteer.id });

    const leaderVolunteerId = leaderVolunteerRow?.id;
    const subLeaderVolunteerId = subLeaderVolunteerRow?.id;
    const schedulingVolunteerId = schedulingVolunteerRow?.id;

    if (!leaderVolunteerId || !subLeaderVolunteerId || !schedulingVolunteerId) {
      throw new Error(
        'Failed to bind scheduling role volunteers for E2E seed.',
      );
    }

    await db
      .insert(volunteer)
      .values(
        POOL_VOLUNTEERS.map((v) => ({
          id: v.id,
          churchId: E2E_IDS.church,
          userId: v.userId,
          status: 'active' as const,
        })),
      )
      .onConflictDoNothing();

    await db
      .insert(ministryVolunteer)
      .values([
        {
          id: 'e2eccccc-cccc-cccc-cccc-ccccccccccc1',
          churchId: E2E_IDS.church,
          volunteerId: leaderVolunteerId,
          ministryId: E2E_IDS.ministry,
          systemRole: 'leader',
          status: 'active',
        },
        {
          id: 'e2eccccc-cccc-cccc-cccc-ccccccccccc7',
          churchId: E2E_IDS.church,
          volunteerId: leaderVolunteerId,
          ministryId: E2E_IDS.ministryCare,
          teamId: E2E_IDS.careTeam,
          systemRole: 'volunteer',
          status: 'active',
        },
        {
          // Sub-leader is scoped to team1.
          id: 'e2eccccc-cccc-cccc-cccc-cccccccccca6',
          churchId: E2E_IDS.church,
          volunteerId: subLeaderVolunteerId,
          ministryId: E2E_IDS.ministry,
          systemRole: 'sub_leader',
          teamId: E2E_IDS.team1,
          status: 'active',
        },
        {
          id: 'e2eccccc-cccc-cccc-cccc-cccccccccca7',
          churchId: E2E_IDS.church,
          volunteerId: schedulingVolunteerId,
          ministryId: E2E_IDS.ministry,
          systemRole: 'volunteer',
          status: 'active',
        },
        ...POOL_VOLUNTEERS.map((v, i) => ({
          id: `e2eccccc-cccc-cccc-cccc-cccccccccc0${i + 2}`,
          churchId: E2E_IDS.church,
          volunteerId: v.id,
          ministryId: E2E_IDS.ministry,
          systemRole: 'volunteer' as const,
          teamId: v.teamId ?? null,
          status: 'active' as const,
        })),
      ])
      .onConflictDoUpdate({
        target: [ministryVolunteer.id],
        set: { teamId: ministryVolunteer.teamId },
      });

    await db
      .insert(event)
      .values([
        {
          id: E2E_IDS.event,
          churchId: E2E_IDS.church,
          planningCycleId: E2E_IDS.planningCycle,
          title: 'E2E Sunday Service',
          startDate: new Date('2026-12-25T09:00:00Z'),
          endDate: new Date('2026-12-25T11:00:00Z'),
          status: 'draft',
          eventType: 'hourly',
        },
        {
          id: E2E_IDS.eventOverride,
          churchId: E2E_IDS.church,
          planningCycleId: E2E_IDS.planningCycle,
          title: 'E2E Override Service',
          startDate: new Date('2026-12-26T09:00:00Z'),
          endDate: new Date('2026-12-26T11:00:00Z'),
          status: 'draft',
          eventType: 'hourly',
        },
        {
          id: E2E_IDS.declineEvent,
          churchId: E2E_IDS.church,
          planningCycleId: E2E_IDS.planningCycle,
          title: 'E2E Decline Service',
          startDate: new Date('2026-12-27T09:00:00Z'),
          endDate: new Date('2026-12-27T11:00:00Z'),
          status: 'scheduled',
          eventType: 'hourly',
        },
        {
          id: E2E_IDS.us6Event,
          churchId: E2E_IDS.church,
          planningCycleId: E2E_IDS.planningCycle,
          title: 'E2E Sub-Leader Service',
          startDate: new Date('2026-12-28T09:00:00Z'),
          endDate: new Date('2026-12-28T11:00:00Z'),
          status: 'draft',
          eventType: 'hourly',
        },
        {
          id: E2E_IDS.careEvent,
          churchId: E2E_IDS.church,
          planningCycleId: E2E_IDS.planningCycle,
          title: 'E2E Care Gathering',
          startDate: new Date('2026-12-24T09:00:00Z'),
          endDate: new Date('2026-12-24T11:00:00Z'),
          status: 'scheduled',
          eventType: 'hourly',
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(ministryParticipation)
      .values([
        ...Object.entries(PARTICIPATION_IDS).map(([eventId, id]) => ({
          id,
          churchId: E2E_IDS.church,
          eventId,
          ministryId:
            eventId === E2E_IDS.careEvent
              ? E2E_IDS.ministryCare
              : E2E_IDS.ministry,
          state:
            eventId === E2E_IDS.us6Event
              ? ('availability_fired' as const)
              : ('published' as const),
        })),
        {
          id: US4_SHARED_CARE_PARTICIPATION_ID,
          churchId: E2E_IDS.church,
          eventId: E2E_IDS.us6Event,
          ministryId: E2E_IDS.ministryCare,
          state: 'availability_fired' as const,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(timeSlot)
      .values([
        {
          id: E2E_IDS.slot,
          churchId: E2E_IDS.church,
          eventId: E2E_IDS.event,
          startTime: new Date('2026-12-25T09:00:00Z'),
          endTime: new Date('2026-12-25T11:00:00Z'),
          label: 'Morning Service',
        },
        {
          id: E2E_IDS.slotOverride,
          churchId: E2E_IDS.church,
          eventId: E2E_IDS.eventOverride,
          startTime: new Date('2026-12-26T09:00:00Z'),
          endTime: new Date('2026-12-26T11:00:00Z'),
          label: 'Override Service',
        },
        {
          id: E2E_IDS.declineSlot,
          churchId: E2E_IDS.church,
          eventId: E2E_IDS.declineEvent,
          startTime: new Date('2026-12-27T09:00:00Z'),
          endTime: new Date('2026-12-27T11:00:00Z'),
          label: 'Decline Service',
        },
        {
          id: E2E_IDS.us6Slot,
          churchId: E2E_IDS.church,
          eventId: E2E_IDS.us6Event,
          startTime: new Date('2026-12-28T09:00:00Z'),
          endTime: new Date('2026-12-28T11:00:00Z'),
          label: 'Sub-Leader Service',
        },
        {
          id: E2E_IDS.careSlot,
          churchId: E2E_IDS.church,
          eventId: E2E_IDS.careEvent,
          startTime: new Date('2026-12-24T09:00:00Z'),
          endTime: new Date('2026-12-24T11:00:00Z'),
          label: 'Care Check-In',
        },
      ])
      .onConflictDoNothing();

    const slotSpecs = [
      [
        E2E_IDS.slot,
        E2E_IDS.event,
        '2026-12-25T09:00:00Z',
        '2026-12-25T11:00:00Z',
      ],
      [
        E2E_IDS.slotOverride,
        E2E_IDS.eventOverride,
        '2026-12-26T09:00:00Z',
        '2026-12-26T11:00:00Z',
      ],
      [
        E2E_IDS.declineSlot,
        E2E_IDS.declineEvent,
        '2026-12-27T09:00:00Z',
        '2026-12-27T11:00:00Z',
      ],
      [
        E2E_IDS.us6Slot,
        E2E_IDS.us6Event,
        '2026-12-28T09:00:00Z',
        '2026-12-28T11:00:00Z',
      ],
      [
        E2E_IDS.careSlot,
        E2E_IDS.careEvent,
        '2026-12-24T09:00:00Z',
        '2026-12-24T11:00:00Z',
      ],
    ] as const;
    await db
      .insert(shift)
      .values([
        ...slotSpecs.map(([slotId, eventId, startTime, endTime]) => ({
          id: SHIFT_IDS[slotId],
          churchId: E2E_IDS.church,
          participationId: PARTICIPATION_IDS[eventId],
          timeSlotId: slotId,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
        })),
        {
          id: US4_SHARED_CARE_SHIFT_ID,
          churchId: E2E_IDS.church,
          participationId: US4_SHARED_CARE_PARTICIPATION_ID,
          timeSlotId: E2E_IDS.us6Slot,
          startTime: new Date('2026-12-28T09:00:00Z'),
          endTime: new Date('2026-12-28T11:00:00Z'),
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(slotRequirement)
      .values([
        // Primary event: 2 Usher slots (US1 assigns one via suggestion accept).
        {
          id: 'e2e88888-8888-8888-8888-888888888881',
          churchId: E2E_IDS.church,
          participationId: PARTICIPATION_IDS[E2E_IDS.event],
          shiftId: SHIFT_IDS[E2E_IDS.slot],
          roleId: E2E_IDS.roleUsher,
          requiredCount: 2,
        },
        // Override event: 1 Usher slot (US2 assigns Mallory to trigger conflict).
        {
          id: 'e2e88888-8888-8888-8888-888888888882',
          churchId: E2E_IDS.church,
          participationId: PARTICIPATION_IDS[E2E_IDS.eventOverride],
          shiftId: SHIFT_IDS[E2E_IDS.slotOverride],
          roleId: E2E_IDS.roleUsher,
          requiredCount: 1,
        },
        // Decline event: 1 Usher slot (US3 — pre-seeded as declined assignment).
        {
          id: 'e2e88888-8888-8888-8888-888888888883',
          churchId: E2E_IDS.church,
          participationId: PARTICIPATION_IDS[E2E_IDS.declineEvent],
          shiftId: SHIFT_IDS[E2E_IDS.declineSlot],
          roleId: E2E_IDS.roleUsher,
          requiredCount: 1,
        },
        // US6 event: Greeter slot scoped to team1 (sub-leader can interact).
        {
          id: 'e2e88888-8888-8888-8888-888888888884',
          churchId: E2E_IDS.church,
          participationId: PARTICIPATION_IDS[E2E_IDS.us6Event],
          shiftId: SHIFT_IDS[E2E_IDS.us6Slot],
          roleId: E2E_IDS.roleGreeter,
          requiredCount: 1,
          teamId: E2E_IDS.team1,
        },
        // US6 event: Usher slot NOT team-scoped (sub-leader sees it as read-only).
        {
          id: 'e2e88888-8888-8888-8888-888888888885',
          churchId: E2E_IDS.church,
          participationId: PARTICIPATION_IDS[E2E_IDS.us6Event],
          shiftId: SHIFT_IDS[E2E_IDS.us6Slot],
          roleId: E2E_IDS.roleUsher,
          requiredCount: 1,
        },
        {
          id: 'e2e88888-8888-8888-8888-888888888886',
          churchId: E2E_IDS.church,
          participationId: PARTICIPATION_IDS[E2E_IDS.careEvent],
          shiftId: SHIFT_IDS[E2E_IDS.careSlot],
          roleId: E2E_IDS.roleCareHost,
          requiredCount: 1,
          teamId: E2E_IDS.careTeam,
        },
        {
          id: 'e2e88888-8888-8888-8888-888888888887',
          churchId: E2E_IDS.church,
          participationId: US4_SHARED_CARE_PARTICIPATION_ID,
          shiftId: US4_SHARED_CARE_SHIFT_ID,
          roleId: E2E_IDS.roleCareHost,
          requiredCount: 1,
          teamId: E2E_IDS.careTeam,
        },
      ])
      .onConflictDoNothing();

    // US3 — seed Grace Hopper's assignment as declined so the builder shows the
    // × badge and opens substitution mode when clicked.
    await db
      .insert(assignment)
      .values([
        {
          id: E2E_IDS.declineAssignment,
          churchId: E2E_IDS.church,
          participationId: PARTICIPATION_IDS[E2E_IDS.declineEvent],
          shiftId: SHIFT_IDS[E2E_IDS.declineSlot],
          volunteerId: POOL_VOLUNTEERS[0].id, // Grace Hopper
          roleId: E2E_IDS.roleUsher,
          status: 'declined',
        },
        {
          id: E2E_IDS.careAssignment,
          churchId: E2E_IDS.church,
          participationId: PARTICIPATION_IDS[E2E_IDS.careEvent],
          shiftId: SHIFT_IDS[E2E_IDS.careSlot],
          volunteerId: leaderVolunteerId,
          roleId: E2E_IDS.roleCareHost,
          status: 'confirmed',
        },
      ])
      .onConflictDoNothing();

    const availabilityChecks = POOL_VOLUNTEERS.map((_volunteer, index) => ({
      id: `e2eacccc-cccc-cccc-cccc-cccccccccc0${index + 1}`,
      churchId: E2E_IDS.church,
      planningCycleId: E2E_IDS.planningCycle,
      ministryVolunteerId: `e2eccccc-cccc-cccc-cccc-cccccccccc0${index + 2}`,
    }));
    await db
      .insert(availabilityCheck)
      .values(availabilityChecks)
      .onConflictDoNothing();
    await db
      .insert(availability)
      .values({
        id: 'e2eaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04',
        churchId: E2E_IDS.church,
        availabilityCheckId: availabilityChecks[3]?.id as string,
        shiftId: SHIFT_IDS[E2E_IDS.slotOverride],
      })
      .onConflictDoNothing();

    await db
      .insert(volunteerNotification)
      .values({
        id: 'e2ef1111-1111-1111-1111-111111111111',
        churchId: E2E_IDS.church,
        volunteerId: leaderVolunteerId,
        ministryId: E2E_IDS.ministry,
        eventId: E2E_IDS.declineEvent,
        assignmentId: E2E_IDS.declineAssignment,
        type: 'assignment_removed',
        title: 'Assignment removed',
        body: 'You are no longer scheduled for Usher at E2E Decline Service.',
        payload: {
          assignmentId: E2E_IDS.declineAssignment,
          eventId: E2E_IDS.declineEvent,
          ministryId: E2E_IDS.ministry,
          section: 'assignments',
        },
        createdAt: new Date('2026-12-24T08:00:00Z'),
      })
      .onConflictDoNothing();

    return E2E_IDS;
  } finally {
    await pool.end();
  }
}

export interface CleanupE2eOptions {
  leaderUserId?: string;
  subLeaderUserId?: string;
  volunteerUserId?: string;
  churchBAdminUserId?: string;
}

export async function cleanupE2e({
  leaderUserId,
  subLeaderUserId,
  volunteerUserId,
  churchBAdminUserId,
}: CleanupE2eOptions = {}): Promise<void> {
  const { pool, db } = makeDb();
  try {
    // CASCADE from church removes ministry/role/volunteer/event/slot rows.
    await db.delete(church).where(eq(church.id, E2E_IDS.church));
    await db.delete(church).where(eq(church.id, E2E_IDS.churchB));
    // Pool users and disposable auth users are not reachable by church
    // cascade — remove them too.
    const cleanupUserIds = [
      ...POOL_VOLUNTEERS.map((v) => v.userId),
      leaderUserId,
      subLeaderUserId,
      volunteerUserId,
      churchBAdminUserId,
    ].filter((value): value is string => Boolean(value));

    if (cleanupUserIds.length > 0) {
      await db.delete(user).where(inArray(user.id, cleanupUserIds));
    }
  } finally {
    await pool.end();
  }
}

function parseArg(argv: string[], flag: string): string | undefined {
  return argv.find((a) => a.startsWith(`--${flag}=`))?.split('=')[1];
}

// CLI entry: `bun run seed:e2e -- --leader-user-id=<id> --sub-leader-user-id=<id>`
// or: `bun run seed:e2e -- cleanup`
if (import.meta.main) {
  const argv = process.argv.slice(2);
  const run = async () => {
    if (argv.includes('cleanup')) {
      await cleanupE2e({
        leaderUserId: parseArg(argv, 'leader-user-id'),
        subLeaderUserId: parseArg(argv, 'sub-leader-user-id'),
        volunteerUserId: parseArg(argv, 'volunteer-user-id'),
        churchBAdminUserId: parseArg(argv, 'church-b-admin-user-id'),
      });
      console.log('[e2e-seed] cleaned up');
      return;
    }
    const leaderUserId = parseArg(argv, 'leader-user-id');
    const subLeaderUserId = parseArg(argv, 'sub-leader-user-id');
    const volunteerUserId = parseArg(argv, 'volunteer-user-id');
    const churchBAdminUserId = parseArg(argv, 'church-b-admin-user-id');
    if (
      !leaderUserId ||
      !subLeaderUserId ||
      !volunteerUserId ||
      !churchBAdminUserId
    ) {
      throw new Error(
        'Usage: seed:e2e -- --leader-user-id=<id> --sub-leader-user-id=<id> --volunteer-user-id=<id> --church-b-admin-user-id=<id>',
      );
    }
    const ids = await seedE2e({
      leaderUserId,
      subLeaderUserId,
      volunteerUserId,
      churchBAdminUserId,
    });
    console.log(
      `[e2e-seed] seeded event ${ids.event} for leader ${leaderUserId} and sub-leader ${subLeaderUserId}`,
    );
  };
  run().catch((err) => {
    console.error('[e2e-seed] failed:', err);
    process.exit(1);
  });
}
