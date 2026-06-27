import * as schema from '@church/db';
import {
  assignment,
  availability,
  church,
  event,
  ministry,
  ministryVolunteer,
  role,
  slotRequirement,
  team,
  timeSlot,
  volunteer,
} from '@church/db';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

/**
 * E2E domain seed (T126). Lives in `apps/server` because the frontend package
 * must not depend on DB tooling. Invoked from the web Playwright `globalSetup`
 * via shell-out:
 *   bun run --cwd apps/server seed:e2e -- --leader-user-id=<id> --sub-leader-user-id=<id>
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
  ministry: 'e2e33333-3333-3333-3333-333333333331',
  leaderVolunteer: 'e2e44444-4444-4444-4444-444444444441',
  subLeaderVolunteer: 'e2e44444-4444-4444-4444-444444444446',
  team1: 'e2eteam1-0000-0000-0000-000000000001',
  roleUsher: 'e2e55555-5555-5555-5555-555555555551',
  roleGreeter: 'e2e55555-5555-5555-5555-555555555552',
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
} as const;

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

export async function seedE2e(
  leaderUserId: string,
  subLeaderUserId: string,
): Promise<typeof E2E_IDS> {
  const { pool, db } = makeDb();
  try {
    // Pool volunteers each need a `user` row (volunteer.user_id is NOT NULL +
    // UNIQUE FK). Raw insert — these are passwordless; they never sign in.
    const poolUserValues = POOL_VOLUNTEERS.map(
      (v) => `('${v.userId}', '${v.name}', '${v.email}', true, now(), now())`,
    ).join(', ');
    await db.execute(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ${poolUserValues}
      ON CONFLICT (id) DO NOTHING
    `);

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
      .insert(ministry)
      .values({
        id: E2E_IDS.ministry,
        churchId: E2E_IDS.church,
        name: 'E2E Worship',
        enforcementType: 'soft',
      })
      .onConflictDoNothing();

    // Team1 — used by US6 sub-leader scoping.
    await db
      .insert(team)
      .values({
        id: E2E_IDS.team1,
        churchId: E2E_IDS.church,
        ministryId: E2E_IDS.ministry,
        name: 'E2E Team Alpha',
      })
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
      ])
      .onConflictDoNothing();

    await db
      .insert(volunteer)
      .values([
        {
          id: E2E_IDS.leaderVolunteer,
          churchId: E2E_IDS.church,
          userId: leaderUserId,
          status: 'active',
        },
        {
          id: E2E_IDS.subLeaderVolunteer,
          churchId: E2E_IDS.church,
          userId: subLeaderUserId,
          status: 'active',
        },
        ...POOL_VOLUNTEERS.map((v) => ({
          id: v.id,
          churchId: E2E_IDS.church,
          userId: v.userId,
          status: 'active' as const,
        })),
      ])
      .onConflictDoNothing();

    await db
      .insert(ministryVolunteer)
      .values([
        {
          id: 'e2eccccc-cccc-cccc-cccc-ccccccccccc1',
          churchId: E2E_IDS.church,
          volunteerId: E2E_IDS.leaderVolunteer,
          ministryId: E2E_IDS.ministry,
          systemRole: 'leader',
          status: 'active',
        },
        {
          // Sub-leader is scoped to team1.
          id: 'e2eccccc-cccc-cccc-cccc-cccccccccca6',
          churchId: E2E_IDS.church,
          volunteerId: E2E_IDS.subLeaderVolunteer,
          ministryId: E2E_IDS.ministry,
          systemRole: 'sub_leader',
          teamId: E2E_IDS.team1,
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
          ministryId: E2E_IDS.ministry,
          title: 'E2E Sunday Service',
          startDate: new Date('2026-12-25T09:00:00Z'),
          endDate: new Date('2026-12-25T11:00:00Z'),
          status: 'draft',
          eventType: 'hourly',
        },
        {
          id: E2E_IDS.eventOverride,
          churchId: E2E_IDS.church,
          ministryId: E2E_IDS.ministry,
          title: 'E2E Override Service',
          startDate: new Date('2026-12-26T09:00:00Z'),
          endDate: new Date('2026-12-26T11:00:00Z'),
          status: 'draft',
          eventType: 'hourly',
        },
        {
          id: E2E_IDS.declineEvent,
          churchId: E2E_IDS.church,
          ministryId: E2E_IDS.ministry,
          title: 'E2E Decline Service',
          startDate: new Date('2026-12-27T09:00:00Z'),
          endDate: new Date('2026-12-27T11:00:00Z'),
          status: 'published',
          eventType: 'hourly',
        },
        {
          id: E2E_IDS.us6Event,
          churchId: E2E_IDS.church,
          ministryId: E2E_IDS.ministry,
          title: 'E2E Sub-Leader Service',
          startDate: new Date('2026-12-28T09:00:00Z'),
          endDate: new Date('2026-12-28T11:00:00Z'),
          status: 'draft',
          eventType: 'hourly',
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
      ])
      .onConflictDoNothing();

    await db
      .insert(slotRequirement)
      .values([
        // Primary event: 2 Usher slots (US1 assigns one via suggestion accept).
        {
          id: 'e2e88888-8888-8888-8888-888888888881',
          churchId: E2E_IDS.church,
          slotId: E2E_IDS.slot,
          roleId: E2E_IDS.roleUsher,
          requiredCount: 2,
        },
        // Override event: 1 Usher slot (US2 assigns Mallory to trigger conflict).
        {
          id: 'e2e88888-8888-8888-8888-888888888882',
          churchId: E2E_IDS.church,
          slotId: E2E_IDS.slotOverride,
          roleId: E2E_IDS.roleUsher,
          requiredCount: 1,
        },
        // Decline event: 1 Usher slot (US3 — pre-seeded as declined assignment).
        {
          id: 'e2e88888-8888-8888-8888-888888888883',
          churchId: E2E_IDS.church,
          slotId: E2E_IDS.declineSlot,
          roleId: E2E_IDS.roleUsher,
          requiredCount: 1,
        },
        // US6 event: Greeter slot scoped to team1 (sub-leader can interact).
        {
          id: 'e2e88888-8888-8888-8888-888888888884',
          churchId: E2E_IDS.church,
          slotId: E2E_IDS.us6Slot,
          roleId: E2E_IDS.roleGreeter,
          requiredCount: 1,
          teamId: E2E_IDS.team1,
        },
        // US6 event: Usher slot NOT team-scoped (sub-leader sees it as read-only).
        {
          id: 'e2e88888-8888-8888-8888-888888888885',
          churchId: E2E_IDS.church,
          slotId: E2E_IDS.us6Slot,
          roleId: E2E_IDS.roleUsher,
          requiredCount: 1,
        },
      ])
      .onConflictDoNothing();

    // US3 — seed Grace Hopper's assignment as declined so the builder shows the
    // × badge and opens substitution mode when clicked.
    await db
      .insert(assignment)
      .values({
        id: E2E_IDS.declineAssignment,
        churchId: E2E_IDS.church,
        slotId: E2E_IDS.declineSlot,
        volunteerId: POOL_VOLUNTEERS[0].id, // Grace Hopper
        roleId: E2E_IDS.roleUsher,
        status: 'declined',
      })
      .onConflictDoNothing();

    await db
      .insert(availability)
      .values(
        POOL_VOLUNTEERS.map((v, i) => ({
          id: `e2eaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa0${i + 1}`,
          churchId: E2E_IDS.church,
          volunteerId: v.id,
          type: v.avail,
          // Spans all seeded events (Dec 25–29).
          startTime: new Date('2026-12-25T00:00:00Z'),
          endTime: new Date('2026-12-29T00:00:00Z'),
          isAllDay: false,
        })),
      )
      .onConflictDoNothing();

    return E2E_IDS;
  } finally {
    await pool.end();
  }
}

export async function cleanupE2e(): Promise<void> {
  const { pool, db } = makeDb();
  try {
    // CASCADE from church removes ministry/role/volunteer/event/slot rows.
    await db.execute(`DELETE FROM "church" WHERE id = '${E2E_IDS.church}'`);
    // Pool user rows and sub-leader user are not reachable by the church
    // cascade — remove them too.
    const poolUserIds = POOL_VOLUNTEERS.map((v) => `'${v.userId}'`).join(', ');
    await db.execute(`DELETE FROM "user" WHERE id IN (${poolUserIds})`);
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
      await cleanupE2e();
      console.log('[e2e-seed] cleaned up');
      return;
    }
    const leaderUserId = parseArg(argv, 'leader-user-id');
    const subLeaderUserId = parseArg(argv, 'sub-leader-user-id');
    if (!leaderUserId || !subLeaderUserId) {
      throw new Error(
        'Usage: seed:e2e -- --leader-user-id=<id> --sub-leader-user-id=<id>',
      );
    }
    const ids = await seedE2e(leaderUserId, subLeaderUserId);
    console.log(
      `[e2e-seed] seeded event ${ids.event} for leader ${leaderUserId} and sub-leader ${subLeaderUserId}`,
    );
  };
  run().catch((err) => {
    console.error('[e2e-seed] failed:', err);
    process.exit(1);
  });
}
