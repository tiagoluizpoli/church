import { exportFileName } from '@church/domain-rules/export-file-name';
import {
  exportDayRange,
  exportPartName,
  exportTimeParts,
} from '@church/domain-rules/schedule-export-wording';
import { m } from '@church/i18n/messages';
import {
  type CalendarDay,
  formatDayLabel,
  formatDaySpanShort,
  parseCalendarDay,
} from '@church/time';
import type {
  AttachmentDispositionInput,
  ScheduleExportFileNameInput,
  ScheduleExportPartNameInput,
  ScheduleExportPartText,
  ScheduleExportRenderPayload,
  ScheduleExportRenderPayloadInput,
  ScheduleExportText,
  ScheduleExportTextInput,
} from './schedule-export-render.types';

/**
 * A part's name in the locale: the group, Sector or Role as written, "Semana
 * 02–08 mar", the catch-all's default name; null for the unsplit export.
 */
export function scheduleExportPartName({
  part,
  locale,
}: ScheduleExportPartNameInput): string | null {
  return exportPartName({
    part,
    wording: {
      week: ({ from, to }) => {
        const span = formatDaySpanShort({
          from: parseCalendarDay({ value: from }),
          to: parseCalendarDay({ value: to }),
          locale,
        });
        return m.export_part_week({ span }, { locale });
      },
      catchAll: () => m.export_catch_all_default({}, { locale }),
    },
  });
}

function partText({
  part,
  locale,
}: ScheduleExportPartNameInput): ScheduleExportPartText {
  const { singleRole: role, singleSector: sector } = part;
  return {
    name: scheduleExportPartName({ part, locale }),
    single:
      role && sector
        ? m.export_single_role_and_sector({ role, sector }, { locale })
        : role
          ? m.export_single_role({ role }, { locale })
          : sector
            ? m.export_single_sector({ sector }, { locale })
            : null,
  };
}

function exportText({
  data,
  locale,
}: ScheduleExportTextInput): ScheduleExportText {
  return {
    kicker: m.export_schedule_kicker({}, { locale }),
    range: exportDayRange(data.range),
    parts: data.parts.map((part) => partText({ part, locale })),
    draft: m.export_draft({}, { locale }),
    noService: m.export_no_service({}, { locale }),
    cancelled: m.export_block_cancelled({}, { locale }),
    emptySpot: m.export_empty_spot({}, { locale }),
    catchAll: m.export_catch_all_default({}, { locale }),
    columns: {
      date: m.export_column_date({}, { locale }),
      event: m.export_column_event({}, { locale }),
      time: m.export_column_time({}, { locale }),
      sector: m.export_column_sector({}, { locale }),
      people: m.export_column_people({}, { locale }),
    },
  };
}

/** The data with its fixed text and its days and times worded in the locale. */
export function scheduleExportRenderPayload({
  media,
  ...input
}: ScheduleExportRenderPayloadInput): ScheduleExportRenderPayload {
  const { data, locale } = input;
  const dayList: CalendarDay[] = [];
  const times: Record<string, string> = {};
  const events = data.parts.flatMap((part) =>
    part.groups.flatMap((group) => group.events),
  );
  for (const event of events) {
    dayList.push(event.startDay, event.endDay);
    for (const shift of event.timeBlocks.flatMap((block) => block.shifts)) {
      if (shift.day) dayList.push(shift.day);
      for (const time of [shift.startTime, shift.endTime]) {
        times[time] = m.export_time(exportTimeParts({ time }), { locale });
      }
    }
  }
  const days = Object.fromEntries(
    dayList.map((day) => [day, formatDayLabel({ day, locale })]),
  );
  return { media, data, text: exportText(input), days, times };
}

/**
 * `Escala - <Ministry> - <Cycle>`, plus ` - Rascunho` on a draft,
 * ` - <part>` for one part of a split and then the given suffixes, without
 * characters file systems refuse.
 */
export function scheduleExportFileName({
  data,
  locale,
  part,
  suffixes = [],
}: ScheduleExportFileNameInput): string {
  const name = m.export_file_name(
    { ministry: data.ministry.name, cycle: data.cycle.name },
    { locale },
  );
  const partName = part ? scheduleExportPartName({ part, locale }) : null;
  return exportFileName({
    name,
    suffixes: [
      ...(data.isDraft ? [m.export_draft({}, { locale })] : []),
      ...(partName ? [partName] : []),
      ...suffixes,
    ],
  });
}

/** An attachment header: an ASCII `filename` fallback and the UTF-8 `filename*`. */
export function attachmentDisposition({
  name,
}: AttachmentDispositionInput): string {
  const ascii = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
