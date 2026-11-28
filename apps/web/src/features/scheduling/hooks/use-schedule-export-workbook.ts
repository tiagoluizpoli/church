import { getLocale } from '@church/i18n/runtime';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ExportPage } from '@/features/scheduling/components/prepare/schedule-export-preview';
import {
  scheduleExportSheets,
  writeScheduleWorkbook,
} from '@/features/scheduling/utils/export/schedule-export-workbook';
import type { WorkbookSheet } from '@/features/scheduling/utils/export/schedule-export-workbook.types';
import type { GetScheduleExportData200 } from '@/infrastructure/api/churchAPI.schemas';

interface UseScheduleExportWorkbookInput {
  /** The export data; undefined while it loads. */
  data: GetScheduleExportData200 | undefined;
  enabled: boolean;
}

/**
 * Planilha Excel (#1252): the sheets and the .xlsx file built in the browser
 * from the export data, in the UI language. The preview shows the same sheets.
 */
export function useScheduleExportWorkbook({
  data,
  enabled,
}: UseScheduleExportWorkbookInput) {
  const locale = getLocale();
  const sheets = useMemo<WorkbookSheet[] | undefined>(
    () =>
      data && enabled
        ? scheduleExportSheets({ data, locale }).sheets
        : undefined,
    [data, enabled, locale],
  );
  const file = useQuery({
    queryKey: ['schedule-export-workbook', locale, data],
    queryFn: async (): Promise<ExportPage[]> => [
      {
        blob: await writeScheduleWorkbook({ sheets: sheets ?? [] }),
        number: 1,
      },
    ],
    enabled: sheets !== undefined,
  });
  return { sheets, file };
}
