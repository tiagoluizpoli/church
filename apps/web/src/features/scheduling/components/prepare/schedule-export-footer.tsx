import { exportFileName } from '@church/domain-rules/export-file-name';
import { m } from '@church/i18n/messages';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { ExportPage } from '@/features/scheduling/components/prepare/schedule-export-preview';
import {
  EXPORT_FILE_TYPE,
  type ExportFormat,
} from '@/features/scheduling/hooks/use-schedule-export-files';

interface ExportFilesInput {
  files: ExportPage[];
  format: ExportFormat;
  /** The localized "Escala - <Ministry> - <Cycle>". */
  name: string;
  isDraft: boolean;
  /** Each split part's name, in order. */
  partNames: (string | null)[];
}

/**
 * The files as the leader keeps or sends them: named, typed, a split's
 * after its part, and numbered inside their part when it has several.
 */
function exportFiles({
  files,
  format,
  name,
  isDraft,
  partNames,
}: ExportFilesInput) {
  const draft = isDraft ? [m.export_draft()] : [];
  return files.map(({ blob, part, number }) => {
    const partName = part ? partNames[part - 1] : null;
    const count = files.filter((file) => file.part === part).length;
    const suffixes = [
      ...draft,
      ...(partName ? [partName] : []),
      ...(count > 1
        ? [m.export_file_part({ part: String(number), count: String(count) })]
        : []),
    ];
    const fileName = exportFileName({ name, suffixes });
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

/**
 * Whether this device's share sheet takes files of the format. Never the
 * workbook: share sheets that claim to take it still reject it (#1108).
 */
function canShareFormat(format: ExportFormat): boolean {
  if (format === 'xlsx' || typeof navigator.canShare !== 'function') {
    return false;
  }
  const probe = new File([], `probe.${format}`, {
    type: EXPORT_FILE_TYPE[format],
  });
  return navigator.canShare({ files: [probe] });
}

interface ScheduleExportFooterProps {
  format: ExportFormat;
  /** The files' "Escala - <Ministry> - <Cycle>" name, once known. */
  name: string;
  isDraft: boolean;
  /** The prefetched files; undefined until ready. */
  files: ExportPage[] | undefined;
  /** Each split part's name, in order. */
  partNames: (string | null)[];
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
 * (#1251), never for Excel (#1252): both act on the prefetched files at once, so the share sheet
 * opens on the tap itself. Every file goes in one share call.
 */
export function ScheduleExportFooter({
  format,
  name,
  isDraft,
  files,
  partNames,
  isFetching,
  error,
  formatLabel,
  span,
  onDone,
}: ScheduleExportFooterProps) {
  const named = files
    ? exportFiles({ files, format, name, isDraft, partNames })
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
