import { exportFileName } from '@church/domain-rules/export-file-name';
import { m } from '@church/i18n/messages';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EXPORT_FILE_TYPE } from '@/features/scheduling/hooks/use-schedule-export-files';
import type { GetScheduleExportFileFormat } from '@/infrastructure/api/churchAPI.schemas';

interface ExportFilesInput {
  blobs: Blob[];
  format: GetScheduleExportFileFormat;
  /** The localized "Escala - <Ministry> - <Cycle>". */
  name: string;
  isDraft: boolean;
}

/** The files as the leader keeps or sends them: named, typed, each part numbered. */
function exportFiles({ blobs, format, name, isDraft }: ExportFilesInput) {
  const draft = isDraft ? [m.export_draft()] : [];
  const count = String(blobs.length);
  return blobs.map((blob, index) => {
    const part =
      blobs.length > 1
        ? [m.export_file_part({ part: String(index + 1), count })]
        : [];
    const fileName = exportFileName({ name, suffixes: [...draft, ...part] });
    return new File([blob], `${fileName}.${format}`, {
      type: EXPORT_FILE_TYPE[format],
    });
  });
}

/** Hands a file to the browser under its own name. */
function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Whether this device's share sheet takes files of the format. */
function canShareFormat(format: GetScheduleExportFileFormat): boolean {
  if (typeof navigator.canShare !== 'function') return false;
  const probe = new File([], `probe.${format}`, {
    type: EXPORT_FILE_TYPE[format],
  });
  return navigator.canShare({ files: [probe] });
}

interface ScheduleExportFooterProps {
  format: GetScheduleExportFileFormat;
  /** The files' "Escala - <Ministry> - <Cycle>" name, once known. */
  name: string;
  isDraft: boolean;
  /** The prefetched files; undefined until ready. */
  files: Blob[] | undefined;
  isFetching: boolean;
  /** Why the files could not be fetched. */
  error: Error | null;
  /** The footer summary: "1 arquivo · PDF para imprimir · <span>". */
  formatLabel: string;
  span: string;
  /** The files were kept or sent. */
  onDone: () => void;
}

/**
 * Baixar everywhere, Compartilhar where the share sheet takes the files
 * (#1251): both act on the prefetched files at once, so the share sheet
 * opens on the tap itself. Every file goes in one share call.
 */
export function ScheduleExportFooter({
  format,
  name,
  isDraft,
  files,
  isFetching,
  error,
  formatLabel,
  span,
  onDone,
}: ScheduleExportFooterProps) {
  const named = files
    ? exportFiles({ blobs: files, format, name, isDraft })
    : undefined;
  const share = () => {
    if (!named) return;
    navigator.share({ files: named }).then(onDone, (refusal: unknown) => {
      // The leader closed the share sheet.
      if (refusal instanceof DOMException && refusal.name === 'AbortError')
        return;
      toast.error(m.export_share_failed());
    });
  };
  const download = () => {
    if (!named) return;
    for (const file of named) saveFile(file);
    onDone();
  };
  const count = named?.length ?? 0;
  const filesLabel =
    count === 1
      ? m.export_files_one()
      : m.export_files_other({ count: String(count) });
  return (
    <>
      <div className="space-y-1 text-xs sm:mr-auto sm:self-center">
        {named ? (
          <p data-export-summary>
            {m.export_summary({ files: filesLabel, format: formatLabel, span })}
          </p>
        ) : null}
        {isDraft ? (
          <p className="text-muted-foreground">{m.export_draft_notice()}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {error.message}
          </p>
        ) : null}
      </div>
      {canShareFormat(format) ? (
        <Button variant="outline" disabled={!named} onClick={share}>
          {m.export_share()}
        </Button>
      ) : null}
      <Button disabled={!named} onClick={download}>
        {isFetching ? <Spinner /> : null}
        {m.export_download()}
      </Button>
    </>
  );
}
