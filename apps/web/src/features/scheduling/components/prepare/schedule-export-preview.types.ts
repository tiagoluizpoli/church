import type { GetScheduleExportDataSplit } from '@/infrastructure/api/churchAPI.schemas';

/** Formato: the card images, the PDF table or the table image. */
export type ExportFormat = 'cards' | 'pdf' | 'png';

export interface PreviewRange {
  from: string;
  to: string;
}

/** What one export is: the preview, the files and their summary follow it. */
export interface ScheduleExportSettings {
  ministryId: string;
  cycleId: string;
  format: ExportFormat;
  /** Null: the whole Cycle. */
  range: PreviewRange | null;
  /** Separar; left out for one part. */
  split?: GetScheduleExportDataSplit;
}

export interface ScheduleExportPreviewProps {
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

export interface PreviewPageProps {
  page: Blob;
  label: string;
}

/** Which page to read: 1-based, inside the 1-based part of a split's images. */
export interface ExportPageRequest {
  page: number;
  part?: number;
}

export type ReadPage = (request: ExportPageRequest) => Promise<Blob>;

export interface ReadExportPagesInput {
  /** A split's images: read part by part. */
  byPart: boolean;
  read: ReadPage;
}
