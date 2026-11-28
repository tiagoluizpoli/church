import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
  FILE_PARAMS,
  previewQueryOptions,
  type ScheduleExportSettings,
} from '@/features/scheduling/components/prepare/schedule-export-preview';
import type { GetScheduleExportFileFormat } from '@/infrastructure/api/churchAPI.schemas';
import { exportApi } from '@/utils/api-instances';

/** Each format's MIME type; the share sheet takes the PDF as a document. */
export const EXPORT_FILE_TYPE = {
  pdf: 'application/pdf',
  png: 'image/png',
} as const satisfies Record<GetScheduleExportFileFormat, string>;

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
 * Every file of the export, in order: the PDF is one file; images (the table,
 * or one per card cut) are read by page until the server answers 404 past the last.
 */
async function readExportFiles({
  ministryId,
  cycleId,
  format,
  range,
}: ScheduleExportSettings): Promise<Blob[]> {
  if (format === 'pdf') {
    const file = await exportApi.getScheduleExportFile(ministryId, cycleId, {
      ...FILE_PARAMS[format],
      ...range,
    });
    return [file];
  }
  const images: Blob[] = [];
  for (;;) {
    const page = images.length + 1;
    try {
      images.push(
        await exportApi.getScheduleExportFile(ministryId, cycleId, {
          ...FILE_PARAMS[format],
          page,
          ...range,
        }),
      );
    } catch (error) {
      if (page > 1 && isAxiosError(error) && error.response?.status === 404) {
        return images;
      }
      throw error;
    }
  }
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
