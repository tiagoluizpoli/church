import { addCalendarMonths, fromDate, today } from '@church/time';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCompositionRoot } from '@/main/di/composition-root';
import { registerControllers } from '@/main/fastify/register-controllers';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { SEED_PERSONA_PASSWORD } from '@/seeds/blueprints/credentials';
import { DEVELOPMENT_CHURCH_TIMEZONE } from '@/seeds/blueprints/development';
import { createDevelopmentReseedPhases } from '@/seeds/development/phases';
import type { DevelopmentRecipeResult } from '@/seeds/recipes/development';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

// Today, as `db:reseed:dev` defaults to: the proposal only fills Shifts that
// are still ahead of the real clock, so a fixed past anchor would leave none.
const ANCHOR = today({
  instant: fromDate({ date: new Date() }),
  timeZone: DEVELOPMENT_CHURCH_TIMEZONE,
});
const CHURCH_ADMIN = 'helena.duarte@igreja-semente.test';

/** `type`s, not interfaces: `execute` rows must be index-signature records. */
type CycleRow = {
  id: string;
  name: string;
  state: string;
  starts: string;
  ends: string;
};
type StatusCountRow = { status: string; total: number };
type LeaderInboxRow = {
  email: string;
  led: string[];
  notified: string[] | null;
  read: boolean | null;
};

let phases: ReturnType<typeof createDevelopmentReseedPhases>;
let seeded: DevelopmentRecipeResult;
let upcoming: CycleRow;
let app: FastifyTypedInstance;

beforeAll(async () => {
  await truncateAll();
  // As autovacuum may right after the clear: statistics saying every table is
  // empty, which the seed's bulk load would otherwise leave standing.
  await testDb.execute(sql`analyze`);
  phases = createDevelopmentReseedPhases({
    pool: testDb.$client,
    anchor: ANCHOR,
  });
  seeded = await phases.load();
  await phases.upcoming({ seeded });
  const cycles = await testDb.execute<CycleRow>(sql`
    select id, name, state, start_date::text as starts, end_date::text as ends
    from cycle where start_date > ${ANCHOR}`);
  [upcoming] = cycles.rows as [CycleRow];

  const root = createCompositionRoot();
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  await app.register(
    (instance) =>
      registerControllers({ app: instance, controllers: root.controllers }),
    { prefix: '/api/v1' },
  );
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app.close();
});

interface ChurchAdminRequestInput {
  url: string;
}

/** As the ChurchAdmin, signed in and inside the primary Church. */
async function asChurchAdmin({ url }: ChurchAdminRequestInput) {
  const signIn = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email: CHURCH_ADMIN, password: SEED_PERSONA_PASSWORD },
  });
  expect(signIn.statusCode).toBe(200);
  const cookie = signIn.cookies
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
  const select = await app.inject({
    method: 'POST',
    url: '/api/v1/active-church/select',
    headers: { cookie },
    payload: { churchId: seeded.church.id },
  });
  expect(select.statusCode, select.body).toBeLessThan(300);
  return app.inject({ method: 'GET', url, headers: { cookie } });
}

async function kidsMinistryId(): Promise<string> {
  const kids = await testDb.execute<{ id: string }>(sql`
    select id from ministry
    where church_id = ${seeded.church.id} and name = 'Kids'`);
  return String(kids.rows[0]?.id);
}

describe('development upcoming Cycle step', () => {
  it('leaves planner statistics counting the rows it loaded, so the first reads plan for them', async () => {
    const stale = await testDb.execute<{ table: string }>(sql`
      select c.relname as table from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.reltuples is distinct from (
          xpath('/row/n/text()', query_to_xml(
            format('select count(*) as n from public.%I', c.relname),
            false, true, ''))
        )[1]::text::real
      order by c.relname`);
    expect(stale.rows).toEqual([]);
  });

  it("leaves one sent Cycle covering the month two months after the anchor's", () => {
    const lastDay = new Date(
      `${addCalendarMonths({ day: ANCHOR, months: 3 })}T00:00:00Z`,
    );
    lastDay.setUTCDate(0);
    expect(upcoming).toMatchObject({
      state: 'sent',
      starts: addCalendarMonths({ day: ANCHOR, months: 2 }),
      ends: lastDay.toISOString().slice(0, 10),
    });
  });

  it('holds only scheduled Events whose every slice asked for availability and assigned nobody', async () => {
    const events = await testDb.execute<StatusCountRow>(sql`
      select status::text as status, count(*)::int as total
      from event where cycle_id = ${upcoming.id} group by status`);
    expect(events.rows).toEqual([
      { status: 'scheduled', total: expect.any(Number) },
    ]);

    const slices = await testDb.execute<StatusCountRow>(sql`
      select p.state::text as status, count(*)::int as total
      from ministry_participation p join event e on e.id = p.event_id
      where e.cycle_id = ${upcoming.id} group by p.state`);
    expect(slices.rows).toEqual([
      { status: 'availability_requested', total: expect.any(Number) },
    ]);

    const assignments = await testDb.execute<{ total: number }>(sql`
      select count(*)::int as total from assignment a
      join ministry_participation p on p.id = a.participation_id
      join event e on e.id = p.event_id
      where e.cycle_id = ${upcoming.id}`);
    expect(assignments.rows).toEqual([{ total: 0 }]);
  });

  it("leaves every active Ministry leader Send's ready-to-prepare notification for the Ministries they lead", async () => {
    const inbox = await testDb.execute<LeaderInboxRow>(sql`
      select u.email,
        array_agg(m.id::text order by m.id) as led,
        (select array_agg(led.value->>'id' order by led.value->>'id')
          from notification n, jsonb_array_elements(n.data->'ministries') led
          where n.user_id = u.id and n.kind = 'cycle_ready_to_prepare'
            and n.data->>'cycleId' = ${upcoming.id}) as notified,
        (select bool_and(n.read_at is not null) from notification n
          where n.user_id = u.id and n.kind = 'cycle_ready_to_prepare') as read
      from ministry_membership mm
      join ministry m on m.id = mm.ministry_id
      join volunteer v on v.id = mm.volunteer_id
      join "user" u on u.id = v.user_id
      where mm.church_id = ${seeded.church.id}
        and mm.ministry_access_level = 'leader' and mm.status = 'active'
        and m.deleted_at is null and v.left_at is null
      group by u.id, u.email order by u.email`);

    expect(inbox.rows.length).toBeGreaterThan(0);
    for (const row of inbox.rows) {
      expect(row.notified, row.email).toEqual(row.led);
      expect(row.read, row.email).toBe(true);
    }
    const notifications = await testDb.execute<{ total: number }>(sql`
      select count(*)::int as total from notification
      where kind = 'cycle_ready_to_prepare'`);
    expect(notifications.rows).toEqual([{ total: inbox.rows.length }]);
  });

  it("opens Kids' Schedule board for the ChurchAdmin", async () => {
    const ministryId = await kidsMinistryId();
    const response = await asChurchAdmin({
      url: `/api/v1/prepare/schedules/${ministryId}/${upcoming.id}`,
    });
    expect(response.statusCode, response.body).toBe(200);
  });

  it('proposes someone for every Kids need, everyone having confirmed', async () => {
    const ministryId = await kidsMinistryId();
    const needs = await testDb.execute<{ total: number }>(sql`
      select coalesce(sum(sr.people_needed), 0)::int as total
      from shift_requirement sr
      join ministry_participation p on p.id = sr.participation_id
      join event e on e.id = p.event_id
      where e.cycle_id = ${upcoming.id} and p.ministry_id = ${ministryId}`);
    const total = needs.rows[0]?.total ?? 0;
    expect(total).toBeGreaterThan(100);

    const response = await asChurchAdmin({
      url: `/api/v1/assign/cycles/${upcoming.id}/assignment-proposal?ministryId=${ministryId}`,
    });
    expect(response.statusCode, response.body).toBe(200);
    const proposal = response.json();
    expect(proposal.additions).toHaveLength(total);
    expect(proposal.gaps).toEqual([]);
    expect(proposal.excludedUnconfirmedCount).toBe(0);
  });
});
