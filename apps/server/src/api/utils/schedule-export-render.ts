import { exportFileName } from '@church/domain-rules/export-file-name';
import { m } from '@church/i18n/messages';
import {
  type CalendarDay,
  formatCalendarDay,
  formatDayLabel,
} from '@church/time';
import type {
  AttachmentDispositionInput,
  ScheduleExportRenderPayload,
  ScheduleExportText,
  ScheduleExportTextInput,
} from './schedule-export-render.types';

function exportText({
  data,
  locale,
}: ScheduleExportTextInput): ScheduleExportText {
  const { singleRole: role, singleSector: sector } = data;
  return {
    kicker: m.export_schedule_kicker({}, { locale }),
    range: `${formatCalendarDay({ day: data.cycle.startDate })} – ${formatCalendarDay({ day: data.cycle.endDate })}`,
    single:
      role && sector
        ? m.export_single_role_and_sector({ role, sector }, { locale })
        : role
          ? m.export_single_role({ role }, { locale })
          : sector
            ? m.export_single_sector({ sector }, { locale })
            : null,
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
export function scheduleExportRenderPayload(
  input: ScheduleExportTextInput,
): ScheduleExportRenderPayload {
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
        const [hours = '', minutes = ''] = time.split(':');
        times[time] = m.export_time({ hours, minutes }, { locale });
      }
    }
  }
  const days = Object.fromEntries(
    dayList.map((day) => [day, formatDayLabel({ day, locale })]),
  );
  return { data, text: exportText(input), days, times };
}

/** `Escala - <Ministry> - <Cycle>` without characters file systems refuse. */
export function scheduleExportFileName({
  data,
  locale,
}: ScheduleExportTextInput): string {
  return exportFileName({
    name: m.export_file_name(
      { ministry: data.ministry.name, cycle: data.cycle.name },
      { locale },
    ),
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
