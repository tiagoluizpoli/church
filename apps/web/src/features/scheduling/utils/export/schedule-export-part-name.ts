import { exportPartName as sharedExportPartName } from '@church/domain-rules/schedule-export-wording';
import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatDaySpanShort, parseCalendarDay } from '@church/time';
import type { GetScheduleExportData200PartsItem } from '@/infrastructure/api/churchAPI.schemas';

interface ExportPartNameInput {
  part: GetScheduleExportData200PartsItem;
}

/**
 * A split part's name as the server words it: the group, Sector or Role as
 * written, "Semana 02–08 mar", the catch-all's default name; null unsplit.
 */
export function exportPartName({ part }: ExportPartNameInput): string | null {
  return sharedExportPartName({
    part,
    wording: {
      week: ({ from, to }) => {
        const span = formatDaySpanShort({
          from: parseCalendarDay({ value: from }),
          to: parseCalendarDay({ value: to }),
          locale: getLocale(),
        });
        return m.export_part_week({ span });
      },
      catchAll: () => m.export_catch_all_default(),
    },
  });
}
