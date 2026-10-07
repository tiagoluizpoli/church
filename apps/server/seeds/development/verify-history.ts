import {
  assignment,
  availability,
  availabilityCheck,
  event,
  eventTemplate,
  ministry,
  ministryParticipation,
  ministryServingProfile,
  ministryVolunteer,
  ministryVolunteerRole,
  participationSlotInclusion,
  planningCycle,
  role,
  shift,
  slotRequirement,
  team,
  timeBlock,
} from '@church/db';
import {
  addCalendarDays,
  type CalendarDay,
  enumerateCalendarDays,
  weekdayIndex,
} from '@church/time';
import { sql } from 'drizzle-orm';
import type { DevelopmentBlueprint } from '../blueprints/development';
import type { ChurchDirectoryBlueprint } from '../blueprints/directory/types';
import type { StaffingNeed } from '../blueprints/gatherings';
import type { SeedWriter } from '../recipe';
import type { DevelopmentRecipeResult } from '../recipes/development';
import { historicalCycleWindow } from './history-window';

export interface HistoryProblemsInput {
  db: SeedWriter;
  seeded: DevelopmentRecipeResult;
  blueprint: DevelopmentBlueprint;
}

/** `type`s, not interfaces: `execute` rows must be index-signature records. */
type KeyRow = {
  key: string;
};

type CountRow = {
  value: string;
};

interface RowsInput {
  db: SeedWriter;
  query: ReturnType<typeof sql>;
}

async function keysOf({ db, query }: RowsInput): Promise<string[]> {
  const result = await db.execute<KeyRow>(query);
  return result.rows.map((row) => row.key).sort();
}

async function countOf({ db, query }: RowsInput): Promise<number> {
  const result = await db.execute<CountRow>(query);
  return Number(result.rows[0]?.value ?? 0);
}

interface DifferenceInput {
  label: string;
  actual: readonly string[];
  expected: readonly string[];
}

/** Both sides as sorted multisets; reports what is missing and unexpected. */
function difference({ label, actual, expected }: DifferenceInput): string[] {
  const remaining = [...actual];
  const missing: string[] = [];
  for (const key of expected) {
    const index = remaining.indexOf(key);
    if (index === -1) missing.push(key);
    else remaining.splice(index, 1);
  }
  if (missing.length === 0 && remaining.length === 0) return [];
  return [
    `${label} differ from the blueprint (missing [${missing.slice(0, 5).join('; ')}], unexpected [${remaining.slice(0, 5).join('; ')}])`,
  ];
}

interface NeedKeyInput {
  ministryName: string;
  need: StaffingNeed;
}

function needKey({ ministryName, need }: NeedKeyInput): string {
  return `${ministryName}|${need.role}|${need.team ?? ''}|${need.count}`;
}

/** One gathering occurrence the cycle must hold. */
interface ExpectedGathering {
  title: string;
  day: CalendarDay;
  week: number;
  slots: ExpectedSlot[];
}

interface ExpectedSlot {
  blockKey?: string;
  /** `HH:mm` local start. */
  startTime: string;
  servers: ExpectedServer[];
}

interface ExpectedServer {
  ministryName: string;
  needs: readonly StaffingNeed[];
}

interface ExpectedGatheringsInput {
  blueprint: DevelopmentBlueprint;
  startDate: CalendarDay;
  endDate: CalendarDay;
}

function expectedGatherings({
  blueprint,
  startDate,
  endDate,
}: ExpectedGatheringsInput): ExpectedGathering[] {
  const { templates, servingRules, dynamicEvents } = blueprint.gatherings;
  const gatherings: ExpectedGathering[] = [];
  for (const day of enumerateCalendarDays({
    start: startDate,
    end: addCalendarDays({ day: endDate, days: -1 }),
  })) {
    const weekday = weekdayIndex({ day });
    const week = Math.floor((Number(day.slice(8, 10)) - 1) / 7) + 1;
    for (const template of templates.filter((t) => t.weekday === weekday)) {
      gatherings.push({
        title: template.name,
        day,
        week,
        slots: template.blocks.map((block) => ({
          blockKey: block.key,
          startTime: block.startTime,
          servers: servingRules.flatMap((rule) => {
            const needs = rule.blocks[block.key];
            return needs === null
              ? []
              : [{ ministryName: rule.ministry.name, needs }];
          }),
        })),
      });
    }
    for (const dynamicEvent of dynamicEvents) {
      if (dynamicEvent.weekday !== weekday) continue;
      if (dynamicEvent.occurrence !== week) continue;
      gatherings.push({
        title: dynamicEvent.title,
        day,
        week,
        slots: [
          {
            startTime: dynamicEvent.startTime,
            servers: dynamicEvent.participations.map((participation) => ({
              ministryName: participation.ministry.name,
              needs: participation.needs,
            })),
          },
        ],
      });
    }
  }
  return gatherings;
}

interface ChurchScopedInput {
  db: SeedWriter;
  churchId: string;
  blueprint: DevelopmentBlueprint;
}

/** EventTemplates, their TimeBlocks, and every MinistryServingProfile. */
async function standingRuleProblems({
  db,
  churchId,
  blueprint,
}: ChurchScopedInput): Promise<string[]> {
  const { templates, servingRules } = blueprint.gatherings;
  const problems = difference({
    label: 'EventTemplate TimeBlocks',
    actual: await keysOf({
      db,
      query: sql`select t.church_id || '|' || t.name || '|' || t.weekday || '|'
          || to_char(b.start_time, 'HH24:MI') || '-' || to_char(b.end_time, 'HH24:MI') as key
        from ${timeBlock} b join ${eventTemplate} t on t.id = b.template_id`,
    }),
    expected: templates.flatMap((template) =>
      template.blocks.map(
        (block) =>
          `${churchId}|${template.name}|${template.weekday}|${block.startTime}-${block.endTime}`,
      ),
    ),
  });

  problems.push(
    ...difference({
      label: 'MinistryServingProfiles',
      actual: await keysOf({
        db,
        query: sql`select m.name || '|' || to_char(b.start_time, 'HH24:MI') || '|' || t.weekday
            || '|' || p.serves || '|' || (p.shift_split ->> 'kind') || (p.shift_split ->> 'count')
            || '|' || coalesce((select string_agg(r.name || '/' || coalesce(tm.name, '') || '/' || (h ->> 'count'), ',' order by r.name, tm.name)
              from jsonb_array_elements(p.headcounts) h
              join ${role} r on r.id = (h ->> 'roleId')::uuid
              left join ${team} tm on tm.id = (h ->> 'teamId')::uuid), '') as key
          from ${ministryServingProfile} p
          join ${ministry} m on m.id = p.ministry_id
          join ${timeBlock} b on b.id = p.source_template_block_id
          join ${eventTemplate} t on t.id = b.template_id
          where p.church_id = ${churchId}`,
      }),
      expected: servingRules.flatMap((rule) =>
        templates.flatMap((template) =>
          template.blocks.map((block) => {
            const needs = rule.blocks[block.key];
            const headcounts = [...(needs ?? [])]
              .sort((left, right) =>
                `${left.role}/${left.team ?? ''}`.localeCompare(
                  `${right.role}/${right.team ?? ''}`,
                ),
              )
              .map((need) => `${need.role}/${need.team ?? ''}/${need.count}`)
              .join(',');
            return `${rule.ministry.name}|${block.startTime}|${template.weekday}|${needs !== null}|equal1|${headcounts}`;
          }),
        ),
      ),
    }),
  );
  return problems;
}

interface CycleProblemsInput extends ChurchScopedInput {
  anchor: CalendarDay;
}

/** The one locked cycle, its Events, Participations, Shifts and requirements. */
async function cycleProblems({
  db,
  churchId,
  blueprint,
  anchor,
}: CycleProblemsInput): Promise<string[]> {
  const window = historicalCycleWindow({ anchor });
  const timeZone = blueprint.primary.church.timezone;
  const problems = difference({
    label:
      'PlanningCycles (only the previous complete month, locked; none from the anchor month on)',
    actual: await keysOf({
      db,
      query: sql`select church_id || '|' || start_date || '|' || end_date || '|' || state as key
        from ${planningCycle}`,
    }),
    expected: [`${churchId}|${window.startDate}|${window.endDate}|locked`],
  });

  const gatherings = expectedGatherings({ blueprint, ...window });
  problems.push(
    ...difference({
      label: 'Events (every gathering of the month, past)',
      actual: await keysOf({
        db,
        query: sql`select e.title || '|' || to_char(e.start at time zone ${timeZone}, 'YYYY-MM-DD HH24:MI')
            || '|' || e.status || '|' || (e.source_template_id is not null)
            || '|' || (e.planning_cycle_id = c.id and c.church_id = ${churchId}) as key
          from ${event} e join ${planningCycle} c on c.id = e.planning_cycle_id`,
      }),
      expected: gatherings.map(
        (gathering) =>
          `${gathering.title}|${gathering.day} ${gathering.slots[0]?.startTime}|past|${gathering.slots[0]?.blockKey !== undefined}|true`,
      ),
    }),
    ...difference({
      label:
        'MinistryParticipations (one published per serving Ministry and Event)',
      actual: await keysOf({
        db,
        query: sql`select e.title || '|' || to_char(e.start at time zone ${timeZone}, 'YYYY-MM-DD')
            || '|' || m.name || '|' || p.state || '|'
            || (select string_agg(to_char(s.start_time at time zone ${timeZone}, 'HH24:MI'), ',' order by s.start_time)
              from ${participationSlotInclusion} i join time_slot s on s.id = i.time_slot_id
              where i.participation_id = p.id) as key
          from ${ministryParticipation} p
          join ${event} e on e.id = p.event_id
          join ${ministry} m on m.id = p.ministry_id`,
      }),
      expected: gatherings.flatMap((gathering) => {
        const ministryNames = [
          ...new Set(
            gathering.slots.flatMap((slot) =>
              slot.servers.map((server) => server.ministryName),
            ),
          ),
        ];
        return ministryNames.map((ministryName) => {
          const served = gathering.slots
            .filter((slot) =>
              slot.servers.some(
                (server) => server.ministryName === ministryName,
              ),
            )
            .map((slot) => slot.startTime)
            .join(',');
          return `${gathering.title}|${gathering.day}|${ministryName}|published|${served}`;
        });
      }),
    }),
    ...difference({
      label: 'SlotRequirements (whole-slot Shifts, Projeção notes included)',
      actual: await keysOf({
        db,
        query: sql`select m.name || '|' || r.name || '|' || coalesce(t.name, '') || '|' || sr.required_count
            || '|' || coalesce(sr.notes, '') || '|' || to_char(sh.start_time at time zone ${timeZone}, 'YYYY-MM-DD HH24:MI')
            || '|' || (sh.start_time = ts.start_time and sh.end_time = ts.end_time) as key
          from ${slotRequirement} sr
          join ${shift} sh on sh.id = sr.shift_id
          join time_slot ts on ts.id = sh.time_slot_id
          join ${ministryParticipation} p on p.id = sr.participation_id
          join ${ministry} m on m.id = p.ministry_id
          join ${role} r on r.id = sr.role_id
          left join ${team} t on t.id = sr.team_id`,
      }),
      expected: gatherings.flatMap((gathering) =>
        gathering.slots.flatMap((slot) =>
          slot.servers.flatMap((server) =>
            server.needs.map(
              (need) =>
                `${needKey({ ministryName: server.ministryName, need })}|${need.notes ?? ''}|${gathering.day} ${slot.startTime}|true`,
            ),
          ),
        ),
      ),
    }),
  );

  // Assignments name a Role, not a Team (#319): staffing is per Shift and Role.
  const blockKeyOf = new Map(
    blueprint.gatherings.templates.flatMap((template) =>
      template.blocks.map((block) => [
        `${template.weekday}|${block.startTime}`,
        block.key,
      ]),
    ),
  );
  const staffing = await db.execute<StaffingRow>(sql`
    select m.name as ministry, r.name as role,
      to_char(sh.start_time at time zone ${timeZone}, 'YYYY-MM-DD') as day,
      extract(dow from sh.start_time at time zone ${timeZone})::int as weekday,
      to_char(sh.start_time at time zone ${timeZone}, 'HH24:MI') as "startTime",
      sum(sr.required_count)::int as required,
      (select count(*) from ${assignment} a
        where a.shift_id = sr.shift_id and a.role_id = sr.role_id
          and a.status in ('draft', 'pending', 'confirmed'))::int as assigned
    from ${slotRequirement} sr
    join ${shift} sh on sh.id = sr.shift_id
    join ${ministryParticipation} p on p.id = sr.participation_id
    join ${ministry} m on m.id = p.ministry_id
    join ${role} r on r.id = sr.role_id
    group by m.name, r.name, sh.start_time, sr.shift_id, sr.role_id`);
  const overfilled = staffing.rows.filter((row) => row.assigned > row.required);
  if (overfilled.length > 0) {
    problems.push(
      `${overfilled.length} Shifts are staffed beyond their requirement`,
    );
  }
  problems.push(
    ...difference({
      label:
        'Shifts published below full (staffed except the declared shortfalls)',
      actual: staffing.rows
        .filter((row) => row.assigned < row.required)
        .map((row) => {
          const block =
            blockKeyOf.get(`${row.weekday}|${row.startTime}`) ?? row.startTime;
          const week = Math.floor((Number(row.day.slice(8, 10)) - 1) / 7) + 1;
          return `${row.ministry}|${row.role}|${block}#${week}|${row.required - row.assigned}`;
        }),
      expected: blueprint.history.shortfalls.map(
        (shortfall) =>
          `${shortfall.post.ministry.name}|${shortfall.post.role}|${shortfall.post.gathering.block}#${shortfall.post.gathering.week}|${shortfall.missing}`,
      ),
    }),
  );

  return problems;
}

/** `type`, not an interface: `execute` rows must be index-signature records. */
type StaffingRow = {
  ministry: string;
  role: string;
  day: string;
  weekday: number;
  startTime: string;
  required: number;
  assigned: number;
};

interface AssignmentProblemsInput {
  db: SeedWriter;
  blueprint: DevelopmentBlueprint;
  directory: ChurchDirectoryBlueprint;
}

/** Qualification, overlap, unavailability, and the blueprint's trail. */
async function assignmentProblems({
  db,
  blueprint,
  directory,
}: AssignmentProblemsInput): Promise<string[]> {
  const problems: string[] = [];
  const active = sql.raw(`('draft', 'pending', 'confirmed')`);

  const unqualified = await countOf({
    db,
    query: sql`select count(*) as value from ${assignment} a
      join ${ministryParticipation} p on p.id = a.participation_id
      where a.status in ${active}
        and not exists (select 1 from ${ministryVolunteer} mv
          join ${ministryVolunteerRole} q on q.ministry_volunteer_id = mv.id
          where mv.volunteer_id = a.volunteer_id and mv.ministry_id = p.ministry_id
            and mv.status = 'active' and mv.left_at is null and q.role_id = a.role_id)`,
  });
  if (unqualified > 0) {
    problems.push(
      `${unqualified} active Assignments are not qualified for their Role`,
    );
  }

  const overlapping = await countOf({
    db,
    query: sql`select count(*) as value from ${assignment} a
      join ${shift} s on s.id = a.shift_id
      join ${assignment} b on b.volunteer_id = a.volunteer_id and b.id < a.id
      join ${shift} t on t.id = b.shift_id
      where a.status in ${active} and b.status in ${active}
        and s.start_time < t.end_time and t.start_time < s.end_time`,
  });
  if (overlapping > 0) {
    problems.push(`${overlapping} unresolved overlaps double-book a Volunteer`);
  }

  const unavailableServing = await countOf({
    db,
    query: sql`select count(*) as value from ${assignment} a
      join ${shift} s on s.id = a.shift_id
      join ${ministryVolunteer} mv on mv.volunteer_id = a.volunteer_id
      join ${availabilityCheck} c on c.ministry_volunteer_id = mv.id
      join ${availability} u on u.availability_check_id = c.id
      join ${shift} t on t.id = u.shift_id
      where a.status in ${active}
        and s.start_time < t.end_time and t.start_time < s.end_time`,
  });
  if (unavailableServing > 0) {
    problems.push(
      `${unavailableServing} active Assignments fall on a Shift their Volunteer marked unavailable`,
    );
  }

  const memberships =
    directory.ministries.reduce(
      (total, ministryBlueprint) =>
        total +
        ministryBlueprint.roster.reduce(
          (sum, group) => sum + group.people.length,
          0,
        ),
      0,
    ) +
    directory.crossMinistry.reduce(
      (total, group) => total + group.emails.length,
      0,
    );
  const { history } = blueprint;
  const trail = {
    'confirmed availability checks': {
      actual: await countOf({
        db,
        query: sql`select count(*) as value from ${availabilityCheck} where state = 'confirmed'`,
      }),
      expected: memberships,
    },
    'unavailability marks': {
      actual: await countOf({
        db,
        query: sql`select count(*) as value from ${availability}`,
      }),
      expected: history.unavailability.reduce(
        (total, incident) => total + incident.gatherings.length,
        0,
      ),
    },
    'declined Assignments': {
      actual: await countOf({
        db,
        query: sql`select count(*) as value from ${assignment} where status = 'declined'`,
      }),
      expected: history.declines.length,
    },
    'Assignments cancelled to resolve an overlap': {
      actual: await countOf({
        db,
        query: sql`select count(*) as value from ${assignment} where status = 'cancelled'`,
      }),
      expected: history.resolvedOverlaps.length,
    },
    'audited withdrawals and replacements': {
      actual: await countOf({
        db,
        query: sql`select count(*) as value from assignment_audit`,
      }),
      expected: 2 * (history.declines.length + history.resolvedOverlaps.length),
    },
  };
  for (const [label, { actual, expected }] of Object.entries(trail)) {
    if (actual !== expected) {
      problems.push(
        `History trail has ${actual} ${label}, expected ${expected}`,
      );
    }
  }

  const crossMinistryServers = await countOf({
    db,
    query: sql`select count(*) as value from (
        select a.volunteer_id from ${assignment} a
        join ${ministryParticipation} p on p.id = a.participation_id
        where a.status in ${active}
        group by a.volunteer_id having count(distinct p.ministry_id) > 1
      ) as cross_ministry`,
  });
  if (crossMinistryServers < history.crossMinistryService.length) {
    problems.push(
      `History trail has ${crossMinistryServers} Volunteers serving two Ministries, expected at least ${history.crossMinistryService.length}`,
    );
  }

  return problems;
}

/**
 * The gatherings and locked historical cycle against the blueprint and the
 * anchor: standing rules, the one locked cycle and nothing from the anchor's
 * month on, published participation staffing, no unresolved overlap, and
 * the history trail.
 */
export async function historyProblems({
  db,
  seeded,
  blueprint,
}: HistoryProblemsInput): Promise<string[]> {
  const churchId = seeded.church.id;
  return [
    ...(await standingRuleProblems({ db, churchId, blueprint })),
    ...(await cycleProblems({
      db,
      churchId,
      blueprint,
      anchor: seeded.anchor,
    })),
    ...(await assignmentProblems({
      db,
      blueprint,
      directory: blueprint.primary,
    })),
  ];
}
