import {
  addCalendarDays,
  addMilliseconds,
  compareCalendarDays,
  fromDate,
  today,
  toTimeOfDay,
  weekdayIndex,
} from '@church/time';
import type {
  BuildScheduleExportEventsInput,
  BuildScheduleExportPartInput,
  EventTemplateIdsInput,
  ExportSinglesInput,
  GroupScheduleExportEventsInput,
  RowsByInput,
  ScheduleExportEvent,
  ScheduleExportGroup,
  ScheduleExportPart,
  ScheduleExportRange,
  ScheduleExportSector,
  ScheduleExportShift,
  ScheduleExportSingles,
  ScheduleExportTimeBlock,
  SingleValueInput,
  SplitScheduleExportInput,
  WeekOfInput,
} from '@/domain/contracts/application/schedule-export-reader';
import type { ScheduleExportRow } from '@/domain/contracts/infrastructure/schedule-export.repository';

const DAYS_PER_WEEK = 7;
/** Weeks start on Monday; `weekdayIndex` counts Sunday as 0. */
const MONDAY = 1;

/**
 * Folds the ordered rows into Events → time blocks → Shifts → Sectors →
 * people without sorting, so the SQL order is the export order. A cancelled
 * Event or block keeps no Shifts; a Sector with nobody in it is left out.
 */
function buildEvents({
  rows,
  paletteIndexBySectorId,
  withEmptySpots,
  timeZone,
}: BuildScheduleExportEventsInput): ScheduleExportEvent[] {
  const events: ScheduleExportEvent[] = [];
  let eventId: string | null = null;
  let blockId: string | null = null;
  let shiftId: string | null = null;
  let multiDay = false;
  let block: ScheduleExportTimeBlock | undefined;
  let currentShift: ScheduleExportShift | undefined;
  for (const [index, row] of rows.entries()) {
    if (row.eventId !== eventId) {
      eventId = row.eventId;
      blockId = null;
      const startDay = today({
        instant: fromDate({ date: row.eventStart }),
        timeZone,
      });
      // An Event ending at midnight ends on the day before.
      const endDay = today({
        instant: addMilliseconds({
          instant: fromDate({ date: row.eventEnd }),
          milliseconds: -1,
        }),
        timeZone,
      });
      multiDay = startDay !== endDay;
      events.push({
        startDay,
        endDay,
        title: row.eventTitle,
        cancelled: row.eventCancelled,
        timeBlocks: [],
      });
    }
    const currentEvent = events.at(-1) as ScheduleExportEvent;
    if (currentEvent.cancelled) continue;
    if (row.blockId !== blockId) {
      blockId = row.blockId;
      shiftId = null;
      block = {
        label: row.blockLabel,
        cancelled: row.blockCancelled,
        shifts: [],
      };
      currentEvent.timeBlocks.push(block);
    }
    if (!block || block.cancelled || !row.shiftStart || !row.shiftEnd) continue;
    if (row.shiftId !== shiftId) {
      shiftId = row.shiftId;
      const start = fromDate({ date: row.shiftStart });
      currentShift = {
        label: row.shiftLabel,
        day: multiDay ? today({ instant: start, timeZone }) : null,
        startTime: toTimeOfDay({ instant: start, timeZone }),
        endTime: toTimeOfDay({
          instant: fromDate({ date: row.shiftEnd }),
          timeZone,
        }),
        sectors: [],
      };
      block.shifts.push(currentShift);
    }
    if (!currentShift || !row.sectorId || !row.sectorName || !row.roleName) {
      continue;
    }
    let sector = currentShift.sectors.at(-1);
    if (sector?.name !== row.sectorName) {
      sector = {
        name: row.sectorName,
        paletteIndex: paletteIndexBySectorId.get(row.sectorId) ?? 0,
        people: [],
      };
      currentShift.sectors.push(sector);
    }
    const role = row.roleName;
    if (row.volunteerName !== null) {
      sector.people.push({ name: row.volunteerName, role });
    }
    const lastOfRequirement =
      rows[index + 1]?.requirementId !== row.requirementId;
    if (withEmptySpots && lastOfRequirement) {
      const filled = sector.people.filter(
        (person) => person.role === role && person.name !== null,
      ).length;
      for (let spot = filled; spot < (row.peopleNeeded ?? 0); spot += 1) {
        sector.people.push({ name: null, role });
      }
    }
  }
  for (const event of events) {
    for (const timeBlock of event.timeBlocks) {
      for (const eventShift of timeBlock.shifts) {
        eventShift.sectors = eventShift.sectors.filter(
          (sector: ScheduleExportSector) => sector.people.length > 0,
        );
      }
      timeBlock.shifts = timeBlock.shifts.filter(
        (eventShift) => eventShift.sectors.length > 0,
      );
    }
  }
  return events;
}

/**
 * Sorts the Events into the Ministry's Event groups, keeping date order in
 * each: the groups in their order, then the catch-all with every Event no
 * group's EventTemplate claims. Empty groups are left out; without groups
 * the Events stay one plain list.
 */
function groupEvents({
  events,
  templateIds,
  setup,
}: GroupScheduleExportEventsInput): ScheduleExportGroup[] {
  if (setup.groups.length === 0) {
    return [{ kind: 'list', name: null, events }];
  }
  const groups: ScheduleExportGroup[] = setup.groups.map((group) => ({
    kind: 'group',
    name: group.name,
    events: [],
  }));
  const catchAll: ScheduleExportGroup = {
    kind: 'catchAll',
    name: setup.catchAllName,
    events: [],
  };
  const groupByTemplateId = new Map<string, ScheduleExportGroup>();
  for (const [index, group] of setup.groups.entries()) {
    for (const template of group.templates) {
      groupByTemplateId.set(template.id, groups[index] as ScheduleExportGroup);
    }
  }
  for (const [index, exported] of events.entries()) {
    const templateId = templateIds[index];
    const group = templateId ? groupByTemplateId.get(templateId) : undefined;
    (group ?? catchAll).events.push(exported);
  }
  return [...groups, catchAll].filter((group) => group.events.length > 0);
}

/** Each Event's EventTemplate, in the rows' Event order. */
function eventTemplateIds({ rows }: EventTemplateIdsInput): (string | null)[] {
  const ids: (string | null)[] = [];
  let eventId: string | null = null;
  for (const row of rows) {
    if (row.eventId === eventId) continue;
    eventId = row.eventId;
    ids.push(row.eventTemplateId);
  }
  return ids;
}

/** The one value every entry shares, if there is exactly one. */
function singleValue({ values }: SingleValueInput): string | null {
  const distinct = new Set(values);
  return distinct.size === 1 ? ([...distinct][0] as string) : null;
}

/** The single Sector and the single Role everyone in the Events serves, if any. */
function exportSingles({ events }: ExportSinglesInput): ScheduleExportSingles {
  const sectors = events.flatMap((exported) =>
    exported.timeBlocks.flatMap((block) =>
      block.shifts.flatMap((eventShift) => eventShift.sectors),
    ),
  );
  return {
    singleSector: singleValue({ values: sectors.map((sector) => sector.name) }),
    singleRole: singleValue({
      values: sectors.flatMap((sector) =>
        sector.people.map((person) => person.role),
      ),
    }),
  };
}

/** One part from its rows: its Events, sorted into the Event groups. */
export function buildPart({
  rows,
  context,
  kind,
  name = null,
  week = null,
}: BuildScheduleExportPartInput): ScheduleExportPart {
  const { setup, ...eventsContext } = context;
  const events = buildEvents({ rows, ...eventsContext });
  return {
    kind,
    name,
    week,
    ...exportSingles({ events }),
    groups: groupEvents({
      events,
      templateIds: eventTemplateIds({ rows }),
      setup,
    }),
  };
}

/** The Monday-to-Sunday week holding the day, kept inside the range. */
function weekOf({ day, range }: WeekOfInput): ScheduleExportRange {
  const sinceMonday =
    (weekdayIndex({ day }) - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const monday = addCalendarDays({ day, days: -sinceMonday });
  const sunday = addCalendarDays({ day: monday, days: DAYS_PER_WEEK - 1 });
  const before = compareCalendarDays({ left: monday, right: range.from }) < 0;
  const after = compareCalendarDays({ left: sunday, right: range.to }) > 0;
  return { from: before ? range.from : monday, to: after ? range.to : sunday };
}

/** The rows under each key, keys in first-seen order; a null key is left out. */
function rowsBy({ rows, key }: RowsByInput): Map<string, ScheduleExportRow[]> {
  const byKey = new Map<string, ScheduleExportRow[]>();
  for (const row of rows) {
    const value = key(row);
    if (value === null) continue;
    const keyed = byKey.get(value);
    if (keyed) keyed.push(row);
    else byKey.set(value, [row]);
  }
  return byKey;
}

/**
 * Separar: the parts in order. Groups as saved with the catch-all last,
 * weeks by date, Sectors and Roles alphabetical. A Sector or Role part keeps
 * only its own spots, and a cancelled Event or block where it had one.
 */
export function splitParts({
  split,
  whole,
  rows,
  context,
  range,
  sectorIds,
  roleIds,
}: SplitScheduleExportInput): ScheduleExportPart[] {
  if (split === 'none') return [whole];
  if (split === 'group') {
    if (context.setup.groups.length === 0) return [whole];
    return whole.groups.map((group) => ({
      kind: group.kind === 'catchAll' ? 'catchAll' : 'group',
      name: group.name,
      week: null,
      ...exportSingles({ events: group.events }),
      groups: [group],
    }));
  }
  if (split === 'week') {
    const { timeZone } = context;
    const weekOfRow = (row: ScheduleExportRow) =>
      weekOf({
        day: today({ instant: fromDate({ date: row.eventStart }), timeZone }),
        range,
      });
    const byWeek = rowsBy({ rows, key: (row) => weekOfRow(row).from });
    return [...byWeek.values()].map((weekRows) =>
      buildPart({
        rows: weekRows,
        context,
        kind: 'week',
        week: weekOfRow(weekRows[0] as ScheduleExportRow),
      }),
    );
  }
  const bySector = split === 'sector';
  const byId = rowsBy({
    rows,
    key: (row) => (bySector ? row.sectorId : row.roleId),
  });
  return (bySector ? sectorIds : roleIds).flatMap((id) => {
    const partRows = byId.get(id);
    const [first] = partRows ?? [];
    if (!partRows || !first) return [];
    const name = bySector ? first.sectorName : first.roleName;
    const part = buildPart({ rows: partRows, context, kind: split, name });
    return [
      bySector
        ? { ...part, singleSector: name }
        : { ...part, singleRole: name },
    ];
  });
}
