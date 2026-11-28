import { m } from '@church/i18n/messages';
import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from '@tanstack/react-query';
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

/** What one export is: the preview, the files and their summary follow it. */
export interface ScheduleExportSettings {
  ministryId: string;
  cycleId: string;
  format: GetScheduleExportFileFormat;
  /** Null: the whole Cycle. */
  range: PreviewRange | null;
  /** Separar; left out for one part. */
  split?: GetScheduleExportDataSplit;
}

interface ScheduleExportPreviewProps {
  /** Settled settings: see `useSettledExportSettings`. */
  settings: ScheduleExportSettings;
  /** Each part's name, in order, to label a split's table images. */
  partNames: (string | null)[];
}

/** One page or image of the export; `part` is set on a split's images. */
export interface ExportPage {
  blob: Blob;
  /** 1-based. */
  part?: number;
  /** 1-based, inside its part. */
  number: number;
}

interface PreviewPageProps {
  page: Blob;
  label: string;
}

export function isNotFound(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

/** Which page to read: 1-based, inside the 1-based part of a split's images. */
export interface ExportPageRequest {
  page: number;
  part?: number;
}

type ReadPage = (request: ExportPageRequest) => Promise<Blob>;

interface ReadExportPagesInput {
  /** A split's images: read part by part. */
  byPart: boolean;
  read: ReadPage;
}

/**
 * Every page in order, or every part's pages in turn: the server answers
 * 404 past the last page and past the last part, so both are read until then.
 */
export async function readExportPages({
  byPart,
  read,
}: ReadExportPagesInput): Promise<ExportPage[]> {
  const readPart = async (part?: number) => {
    const pages: ExportPage[] = [];
    for (;;) {
      const number = pages.length + 1;
      try {
        pages.push({ blob: await read({ page: number, part }), part, number });
      } catch (error) {
        if (number > 1 && isNotFound(error)) return pages;
        throw error;
      }
    }
  };
  if (!byPart) return readPart();
  const pages: ExportPage[] = [];
  for (let part = 1; ; part += 1) {
    try {
      pages.push(...(await readPart(part)));
    } catch (error) {
      if (part > 1 && isNotFound(error)) return pages;
      throw error;
    }
  }
}

/** The preview's SVG pages: the PDF's through every part, or each part's image. */
function readPreviewPages({
  ministryId,
  cycleId,
  format,
  range,
  split,
}: ScheduleExportSettings): Promise<ExportPage[]> {
  return readExportPages({
    byPart: format === 'png' && split !== undefined,
    read: ({ page, part }) =>
      exportApi.getScheduleExportPreview(ministryId, cycleId, {
        format,
        page,
        ...range,
        ...(split ? { split } : {}),
        ...(part ? { part } : {}),
      }),
  });
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
  partNames,
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
        preview.data.map(({ blob, part, number }, index) => {
          const name = part ? partNames[part - 1] : null;
          const label = name
            ? m.export_preview_part_page({ part: name, page: String(number) })
            : m.export_preview_page({ page: String(index + 1) });
          return (
            <PreviewPage key={blob.size + index} page={blob} label={label} />
          );
        })
      )}
    </section>
  );
}
