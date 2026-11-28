import { m } from '@church/i18n/messages';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import type { GetScheduleExportFileFormat } from '@/infrastructure/api/churchAPI.schemas';
import { exportApi } from '@/utils/api-instances';

/** The preview waits this long after the last settings change. */
const PREVIEW_DEBOUNCE_MS = 300;

export interface ScheduleExportPreviewProps {
  ministryId: string;
  cycleId: string;
  format: GetScheduleExportFileFormat;
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
}: ScheduleExportPreviewProps): Promise<Blob[]> {
  const pages: Blob[] = [];
  for (;;) {
    const page = pages.length + 1;
    try {
      pages.push(
        await exportApi.getScheduleExportPreview(ministryId, cycleId, {
          format,
          page,
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

/** The server's own render of the file, so the file never differs from it. */
export function ScheduleExportPreview({
  ministryId,
  cycleId,
  format,
}: ScheduleExportPreviewProps) {
  const [settledFormat, setSettledFormat] = useState(format);
  useEffect(() => {
    const timer = setTimeout(
      () => setSettledFormat(format),
      PREVIEW_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [format]);
  const preview = useQuery({
    queryKey: ['schedule-export-preview', ministryId, cycleId, settledFormat],
    queryFn: () =>
      readPreviewPages({ ministryId, cycleId, format: settledFormat }),
    placeholderData: keepPreviousData,
  });
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
