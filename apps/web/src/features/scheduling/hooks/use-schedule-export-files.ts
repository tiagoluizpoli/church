import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
  type ExportPage,
  previewQueryOptions,
  readExportPages,
  type ScheduleExportSettings,
} from '@/features/scheduling/components/prepare/schedule-export-preview';
import type { GetScheduleExportFileFormat } from '@/infrastructure/api/churchAPI.schemas';
import { exportApi } from '@/utils/api-instances';

/** What the leader exports: a server-rendered file, or the workbook built here. */
export type ExportFormat = GetScheduleExportFileFormat | 'xlsx';

/** Each format's MIME type; the share sheet takes the PDF as a document. */
export const EXPORT_FILE_TYPE = {
  pdf: 'application/pdf',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const satisfies Record<ExportFormat, string>;

/** The refusal's translated message; a blob download carries it as a Blob. */
async function refusalMessage(error: unknown): Promise<string | undefined> {
  if (!isAxiosError(error) || !(error.response?.data instanceof Blob)) {
    return undefined;
  }
  try {
    const { message } = JSON.parse(await error.response.data.text());
    return typeof message === 'string' && message ? message : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every file of the export, in order: the PDF is one file holding every
 * part; images are read by page, and a split's part by part, until the
 * server answers 404 past the last.
 */
async function readExportFiles({
  ministryId,
  cycleId,
  format,
  range,
  split,
}: ScheduleExportSettings): Promise<ExportPage[]> {
  const splitQuery = split ? { split } : {};
  if (format === 'pdf') {
    const file = await exportApi.getScheduleExportFile(ministryId, cycleId, {
      format,
      ...range,
      ...splitQuery,
    });
    return [{ blob: file, number: 1 }];
  }
  return readExportPages({
    byPart: split !== undefined,
    read: ({ page, part }) =>
      exportApi.getScheduleExportFile(ministryId, cycleId, {
        format,
        page,
        ...range,
        ...splitQuery,
        ...(part ? { part } : {}),
      }),
  });
}

interface UseScheduleExportFilesInput {
  /** Settled settings, the same the preview shows. */
  settings: ScheduleExportSettings;
  enabled: boolean;
}

/**
 * The export's real files, fetched in the background once the preview of
 * the same settings settled, so Baixar and Compartilhar never wait (#1251).
 * A refusal carries the server's translated message.
 */
export function useScheduleExportFiles({
  settings,
  enabled,
}: UseScheduleExportFilesInput) {
  const preview = useQuery({ ...previewQueryOptions(settings), enabled });
  const previewSettled = preview.isSuccess && !preview.isPlaceholderData;
  return useQuery({
    queryKey: ['schedule-export-files', settings],
    queryFn: async () => {
      try {
        return await readExportFiles(settings);
      } catch (error) {
        const message = await refusalMessage(error);
        throw new Error(message ?? m.export_download_failed());
      }
    },
    enabled: enabled && previewSettled,
  });
}
