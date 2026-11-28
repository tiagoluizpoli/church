import { m } from '@church/i18n/messages';
import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { exportApi } from '@/utils/api-instances';

/** The preview waits this long after the last settings change. */
const PREVIEW_DEBOUNCE_MS = 300;

interface PreviewRange {
  from: string;
  to: string;
}

/** The file each Formato downloads: card images are PNG files of the cards layout. */
export const FILE_PARAMS = {
  cards: { format: 'png', layout: 'cards' },
  pdf: { format: 'pdf' },
  png: { format: 'png' },
} as const;

/** Formato: the card images, the PDF table or the table image. */
export type ExportFormat = keyof typeof FILE_PARAMS;

/** What one export is: the preview, the files and their summary follow it. */
export interface ScheduleExportSettings {
  ministryId: string;
  cycleId: string;
  format: ExportFormat;
  /** Null: the whole Cycle. */
  range: PreviewRange | null;
}

interface ScheduleExportPreviewProps {
  /** Settled settings: see `useSettledExportSettings`. */
  settings: ScheduleExportSettings;
}

interface PreviewPageProps {
  page: Blob;
  number: number;
}

/**
 * Every SVG page of the file, in order: the server answers 404 past the
 * last page, so pages are read until then.
 */
async function readPreviewPages({
  ministryId,
  cycleId,
  format,
  range,
}: ScheduleExportSettings): Promise<Blob[]> {
  const pages: Blob[] = [];
  for (;;) {
    const page = pages.length + 1;
    try {
      pages.push(
        await exportApi.getScheduleExportPreview(ministryId, cycleId, {
          ...FILE_PARAMS[format],
          page,
          ...range,
        }),
      );
    } catch (error) {
      if (page > 1 && isAxiosError(error) && error.response?.status === 404) {
        return pages;
      }
      throw error;
    }
  }
}

function PreviewPage({ page, number }: PreviewPageProps) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(page);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [page]);
  if (!url) return null;
  return (
    <figure className="space-y-1">
      <img
        src={url}
        alt={m.export_preview_page({ page: String(number) })}
        className="w-full rounded-md border bg-white"
      />
      <figcaption className="text-end text-sm">
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="text-primary underline-offset-4 hover:underline"
        >
          {m.export_preview_full_size()}
        </a>
      </figcaption>
    </figure>
  );
}

/** The settings once they stopped changing for the preview's debounce. */
export function useSettledExportSettings(
  settings: ScheduleExportSettings,
): ScheduleExportSettings {
  const [settled, setSettled] = useState(settings);
  const key = JSON.stringify(settings);
  // biome-ignore lint/correctness/useExhaustiveDependencies: settles on a real change of the settings, not on each render's new object
  useEffect(() => {
    const timer = setTimeout(() => setSettled(settings), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key]);
  return settled;
}

/** The preview pages of settled settings; the dialog waits on it too. */
export function previewQueryOptions(settings: ScheduleExportSettings) {
  return queryOptions({
    queryKey: ['schedule-export-preview', settings],
    queryFn: () => readPreviewPages(settings),
    placeholderData: keepPreviousData,
  });
}

/** The server's own render of the file, so the file never differs from it. */
export function ScheduleExportPreview({
  settings,
}: ScheduleExportPreviewProps) {
  const preview = useQuery(previewQueryOptions(settings));
  return (
    <section aria-label={m.export_preview_label()} className="space-y-3">
      {preview.isPending ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner />
          {m.export_preview_loading()}
        </p>
      ) : preview.isError ? (
        <p className="text-destructive text-sm">{m.export_preview_failed()}</p>
      ) : (
        preview.data.map((page, index) => (
          <PreviewPage key={page.size + index} page={page} number={index + 1} />
        ))
      )}
    </section>
  );
}
