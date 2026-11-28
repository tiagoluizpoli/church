import {
  compareCalendarDays,
  formatMonthShort,
  formatMonthYear,
  now,
  parseCalendarDay,
  toDate,
} from '@church/time';
import { accentTextColor } from '../domain/church-settings';
import type { IScheduleChangeReader } from '../domain/contracts/application/schedule-change-reader';
import type {
  CountScheduleExportPagesInput,
  DbScheduleExportReaderDependencies,
  IScheduleExportReader,
  ListScheduleExportCyclesInput,
  MonthNamesInput,
  ReadScheduleExportInput,
  RenderScheduleExportFileInput,
  ScheduleExport,
  ScheduleExportCycleOption,
  ScheduleExportRenderContext,
  ScheduleExportRenderContextInput,
} from '../domain/contracts/application/schedule-export-reader';
import type { EventGroupRepository } from '../domain/contracts/infrastructure/event-group.repository';
import type { ScheduleExportRepository } from '../domain/contracts/infrastructure/schedule-export.repository';
import type { TypstRenderer } from '../domain/contracts/infrastructure/typst-renderer';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import {
  ExportRangeOutsideCycleError,
  ExportScheduleNotFoundError,
  InvalidDateRangeError,
} from '../domain/errors';
import { duplicateNames } from '../domain/services/schedule-export/duplicate-names';
import {
  buildPart,
  splitParts,
} from '../domain/services/schedule-export/schedule-export-tree';
import { normalizeSearch } from '../domain/services/schedule-export/text-normalizer';

/** The Grid Typst template: the A4 landscape PDF table. */
const TEMPLATES = { grid: 'schedule-grid', cards: 'schedule-cards' } as const;
/** The cards page is 540pt wide: 1080 px at 144 ppi. */
const CARDS_PPI = 144;

/** The locale's 12 month names, long and short ("fevereiro fev"), January first. */
function monthNames({ locale }: MonthNamesInput): string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    const day = parseCalendarDay({ value: `2000-${month}-01` });
    const long = formatMonthYear({ day, locale }).replace(/ \d+$/, '');
    const short = formatMonthShort({ day, locale });
    return normalizeSearch({ value: `${long} ${short}` });
  });
}

export class DbScheduleExportReader implements IScheduleExportReader {
  private readonly scheduleExportRepository: ScheduleExportRepository;
  private readonly eventGroupRepository: EventGroupRepository;
  private readonly scheduleChangeReader: IScheduleChangeReader;
  private readonly unitOfWork: UnitOfWork;
  private readonly typstRenderer: TypstRenderer;

  constructor({
    scheduleExportRepository,
    eventGroupRepository,
    scheduleChangeReader,
    unitOfWork,
    typstRenderer,
  }: DbScheduleExportReaderDependencies) {
    this.scheduleExportRepository = scheduleExportRepository;
    this.eventGroupRepository = eventGroupRepository;
    this.scheduleChangeReader = scheduleChangeReader;
    this.unitOfWork = unitOfWork;
    this.typstRenderer = typstRenderer;
  }

  renderFile({
    exported,
    payload,
    layout,
    format,
    page,
  }: RenderScheduleExportFileInput): Promise<Uint8Array> {
    return this.typstRenderer.render({
      template: TEMPLATES[layout],
      format,
      page,
      ppi: layout === 'cards' ? CARDS_PPI : undefined,
      ...this.renderContext({ exported }),
      payload,
    });
  }

  countPages({
    exported,
    payload,
    layout,
  }: CountScheduleExportPagesInput): Promise<number> {
    return this.typstRenderer.countPages({
      template: TEMPLATES[layout],
      ...this.renderContext({ exported }),
      payload,
    });
  }

  /** What every render of the export embeds besides its payload. */
  private renderContext({
    exported,
  }: ScheduleExportRenderContextInput): ScheduleExportRenderContext {
    const { accentColor, logoKey, changedAt } = exported;
    return {
      creationTimestamp: changedAt,
      logoKey: logoKey ?? undefined,
      // Bars and time bands carry text on the accent: white or near-black.
      inputs: accentColor
        ? { accent: accentColor, accentText: accentTextColor({ accentColor }) }
        : {},
    };
  }

  listCycles({
    churchId,
    ministryId,
    q,
    locale,
  }: ListScheduleExportCyclesInput): Promise<ScheduleExportCycleOption[]> {
    return this.scheduleExportRepository.listCycles({
      churchId,
      ministryId,
      words: normalizeSearch({ value: q ?? '' })
        .split(/\s+/)
        .filter(Boolean),
      monthNames: monthNames({ locale }),
      now: toDate({ instant: now() }),
    });
  }

  async read(input: ReadScheduleExportInput): Promise<ScheduleExport> {
    const { from, to } = input;
    if (from && to && compareCalendarDays({ left: from, right: to }) > 0) {
      throw new InvalidDateRangeError();
    }
    return this.unitOfWork.run(async (tx) => {
      const scope = { ...input, tx };
      const facts = await this.scheduleExportRepository.findSchedule(scope);
      if (!facts) throw new ExportScheduleNotFoundError();
      const { cycleStartDate: startDate, cycleEndDate: endDate } = facts;
      const range = { from: from ?? startDate, to: to ?? endDate };
      if (
        compareCalendarDays({ left: range.from, right: startDate }) < 0 ||
        compareCalendarDays({ left: range.to, right: endDate }) > 0
      ) {
        throw new ExportRangeOutsideCycleError({ startDate, endDate });
      }
      // One transaction connection: its queries run one after another.
      const rows = await this.scheduleExportRepository.listRows({
        ...scope,
        ...range,
        timeZone: facts.timeZone,
      });
      const sectorIds =
        await this.scheduleExportRepository.listSectorIds(scope);
      const roleIds = await this.scheduleExportRepository.listRoleIds(scope);
      const changeCount =
        await this.scheduleChangeReader.countScheduleChanges(scope);
      const setup = await this.eventGroupRepository.findSetup(scope);
      const context = {
        paletteIndexBySectorId: new Map(
          sectorIds.map((id, index) => [id, index]),
        ),
        withEmptySpots: !facts.published,
        timeZone: facts.timeZone,
        setup,
      };
      const whole = buildPart({ rows, context, kind: 'all' });
      const parts = splitParts({
        split: input.split ?? 'none',
        whole,
        rows,
        context,
        range,
        sectorIds,
        roleIds,
      });
      const { singleSector, singleRole } = whole;
      return {
        data: {
          ministry: { name: facts.ministryName },
          cycle: {
            name: facts.cycleName,
            startDate: facts.cycleStartDate,
            endDate: facts.cycleEndDate,
          },
          range,
          isDraft: !facts.published,
          hasUnsentChanges: changeCount > 0,
          singleSector,
          singleRole,
          duplicateNames: duplicateNames({ rows }),
          parts,
        },
        logoKey: facts.logoKey,
        accentColor: facts.accentColor,
        changedAt: facts.changedAt,
      };
    });
  }
}
