import { m } from '@church/i18n/messages';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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

export interface ScheduleExportPreviewProps {
  ministryId: string;
  cycleId: string;
  format: ExportFormat;
  /** Null: the whole Cycle. */
  range: PreviewRange | null;
}

interface PreviewPageProps {
  page: Blob;
  number: number;
}

interface ReadPagesInput {
  read: (page: number) => Promise<Blob>;
}

/**
 * Every page or image, in order: the server answers 404 past the last one,
 * so they are read until then.
 */
export async function readPages({ read }: ReadPagesInput): Promise<Blob[]> {
  const pages: Blob[] = [];
  for (;;) {
    const page = pages.length + 1;
    try {
      pages.push(await read(page));
    } catch (error) {
      if (page > 1 && isAxiosError(error) && error.response?.status === 404) {
        return pages;
      }
      throw error;
    }
  }
}

/** Every SVG page of the file: the card images preview as one page each. */
function readPreviewPages({
  ministryId,
  cycleId,
  format,
  range,
}: ScheduleExportPreviewProps): Promise<Blob[]> {
  return readPages({
    read: (page) =>
      exportApi.getScheduleExportPreview(ministryId, cycleId, {
        ...FILE_PARAMS[format],
        page,
        ...range,
      }),
  });
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
export function ScheduleExportPreview(settings: ScheduleExportPreviewProps) {
  const [settled, setSettled] = useState(settings);
  const key = JSON.stringify(settings);
  // biome-ignore lint/correctness/useExhaustiveDependencies: settles on a real change of the settings, not on each render's new object
  useEffect(() => {
    const timer = setTimeout(() => setSettled(settings), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key]);
  const preview = useQuery({
    queryKey: ['schedule-export-preview', settled],
    queryFn: () => readPreviewPages(settled),
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
