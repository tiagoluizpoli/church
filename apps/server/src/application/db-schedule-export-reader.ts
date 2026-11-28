import { NotFoundError } from '@church/core';
import { addMilliseconds, fromDate, today, toTimeOfDay } from '@church/time';
import type { IScheduleChangeReader } from '../domain/contracts/application/schedule-change-reader';
import type {
  BuildScheduleExportEventsInput,
  DbScheduleExportReaderDependencies,
  DuplicateNamesInput,
  IScheduleExportReader,
  ReadScheduleExportInput,
  RenderScheduleExportFileInput,
  ScheduleExport,
  ScheduleExportEvent,
  ScheduleExportSector,
  ScheduleExportShift,
  ScheduleExportTimeBlock,
  SingleValueInput,
} from '../domain/contracts/application/schedule-export-reader';
import type { ScheduleExportRepository } from '../domain/contracts/infrastructure/schedule-export.repository';
import type { TypstRenderer } from '../domain/contracts/infrastructure/typst-renderer';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';

/** The Grid Typst template: the A4 landscape PDF table. */
const GRID_TEMPLATE = 'schedule-grid';

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

/** The one value every entry shares, if there is exactly one. */
function singleValue({ values }: SingleValueInput): string | null {
  const distinct = new Set(values);
  return distinct.size === 1 ? ([...distinct][0] as string) : null;
}

/** Names of different Volunteers that read the same ignoring case, accents and spaces. */
function duplicateNames({ rows }: DuplicateNamesInput): string[][] {
  const namesByKey = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const { volunteerId, volunteerName } = row;
    if (!volunteerId || volunteerName === null) continue;
    if (row.eventCancelled || row.blockCancelled) continue;
    const key = volunteerName
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const volunteers = namesByKey.get(key) ?? new Map<string, string>();
    volunteers.set(volunteerId, volunteerName);
    namesByKey.set(key, volunteers);
  }
  return [...namesByKey.values()]
    .filter((volunteers) => volunteers.size > 1)
    .map((volunteers) => [...volunteers.values()].sort());
}

export class DbScheduleExportReader implements IScheduleExportReader {
  private readonly scheduleExportRepository: ScheduleExportRepository;
  private readonly scheduleChangeReader: IScheduleChangeReader;
  private readonly unitOfWork: UnitOfWork;
  private readonly typstRenderer: TypstRenderer;

  constructor({
    scheduleExportRepository,
    scheduleChangeReader,
    unitOfWork,
    typstRenderer,
  }: DbScheduleExportReaderDependencies) {
    this.scheduleExportRepository = scheduleExportRepository;
    this.scheduleChangeReader = scheduleChangeReader;
    this.unitOfWork = unitOfWork;
    this.typstRenderer = typstRenderer;
  }

  renderFile({
    exported,
    payload,
    format,
    page,
  }: RenderScheduleExportFileInput): Promise<Uint8Array> {
    return this.typstRenderer.render({
      template: GRID_TEMPLATE,
      format,
      page,
      payload,
      creationTimestamp: exported.changedAt,
      logoKey: exported.logoKey ?? undefined,
    });
  }

  async read(input: ReadScheduleExportInput): Promise<ScheduleExport> {
    return this.unitOfWork.run(async (tx) => {
      const scope = { ...input, tx };
      const facts = await this.scheduleExportRepository.findSchedule(scope);
      if (!facts) throw new NotFoundError('Schedule');
      // One transaction connection: its queries run one after another.
      const rows = await this.scheduleExportRepository.listRows(scope);
      const sectorIds =
        await this.scheduleExportRepository.listSectorIds(scope);
      const changeCount =
        await this.scheduleChangeReader.countScheduleChanges(scope);
      const events = buildEvents({
        rows,
        paletteIndexBySectorId: new Map(
          sectorIds.map((id, index) => [id, index]),
        ),
        withEmptySpots: !facts.published,
        timeZone: facts.timeZone,
      });
      const people = events.flatMap((event) =>
        event.timeBlocks.flatMap((block) =>
          block.shifts.flatMap((eventShift) => eventShift.sectors),
        ),
      );
      const singleSector = singleValue({
        values: people.map((sector) => sector.name),
      });
      const singleRole = singleValue({
        values: people.flatMap((sector) =>
          sector.people.map((person) => person.role),
        ),
      });
      return {
        data: {
          ministry: { name: facts.ministryName },
          cycle: {
            name: facts.cycleName,
            startDate: facts.cycleStartDate,
            endDate: facts.cycleEndDate,
          },
          isDraft: !facts.published,
          hasUnsentChanges: changeCount > 0,
          singleSector,
          singleRole,
          duplicateNames: duplicateNames({ rows }),
          parts: [{ name: null, singleSector, singleRole, events }],
        },
        logoKey: facts.logoKey,
        changedAt: facts.changedAt,
      };
    });
  }
}
