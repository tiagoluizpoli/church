import { m } from '@church/i18n/messages';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import type {
  GetScheduleExportDataSplit,
  GetScheduleExportFileFormat,
} from '@/infrastructure/api/churchAPI.schemas';
import { exportApi } from '@/utils/api-instances';

/** The preview waits this long after the last settings change. */
const PREVIEW_DEBOUNCE_MS = 300;

interface PreviewRange {
  from: string;
  to: string;
}

export interface ScheduleExportPreviewProps {
  ministryId: string;
  cycleId: string;
  format: GetScheduleExportFileFormat;
  /** Null: the whole Cycle. */
  range: PreviewRange | null;
  /** Left out: one part. */
  split?: GetScheduleExportDataSplit;
}

export interface ScheduleExportPreviewViewProps
  extends ScheduleExportPreviewProps {
  /** Each part's name, in order, to label a table image's pages. */
  partNames: (string | null)[];
}

interface PreviewPageProps {
  page: Blob;
  label: string;
}

/** A page of the preview; `part` is set on each table image of a split. */
interface PreviewPageBlob {
  page: Blob;
  part?: number;
  number: number;
}

interface ReadPartPagesInput extends ScheduleExportPreviewProps {
  part?: number;
}

function isNotFound(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

/**
 * Every SVG page of the file or of one table image part, in order: the
 * server answers 404 past the last page, so pages are read until then.
 */
async function readPartPages({
  ministryId,
  cycleId,
  format,
  range,
  split,
  part,
}: ReadPartPagesInput): Promise<PreviewPageBlob[]> {
  const pages: PreviewPageBlob[] = [];
  for (;;) {
    const number = pages.length + 1;
    try {
      const page = await exportApi.getScheduleExportPreview(
        ministryId,
        cycleId,
        {
          format,
          page: number,
          ...range,
          ...(split ? { split } : {}),
          ...(part ? { part } : {}),
        },
      );
      pages.push({ page, part, number });
    } catch (error) {
      if (number > 1 && isNotFound(error)) return pages;
      throw error;
    }
  }
}

/**
 * The preview's pages: the PDF's through every part, or each table image
 * part's in turn, parts read until the server answers 404.
 */
async function readPreviewPages(
  settings: ScheduleExportPreviewProps,
): Promise<PreviewPageBlob[]> {
  if (settings.format === 'pdf' || !settings.split) {
    return readPartPages(settings);
  }
  const pages: PreviewPageBlob[] = [];
  for (let part = 1; ; part += 1) {
    try {
      pages.push(...(await readPartPages({ ...settings, part })));
    } catch (error) {
      if (part > 1 && isNotFound(error)) return pages;
      throw error;
    }
  }
}

function PreviewPage({ page, label }: PreviewPageProps) {
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
        alt={label}
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
  partNames,
  ...settings
}: ScheduleExportPreviewViewProps) {
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
        preview.data.map(({ page, part, number }, index) => {
          const name = part ? partNames[part - 1] : null;
          const label = name
            ? m.export_preview_part_page({ part: name, page: String(number) })
            : m.export_preview_page({ page: String(index + 1) });
          return (
            <PreviewPage key={page.size + index} page={page} label={label} />
          );
        })
      )}
    </section>
  );
}
