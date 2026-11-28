import { m } from '@church/i18n/messages';
import { Spinner } from '@/components/ui/spinner';
import {
  workbookCellText,
  workbookColumnLabel,
} from '@/features/scheduling/utils/export/schedule-export-workbook';
import type { WorkbookSheet } from '@/features/scheduling/utils/export/schedule-export-workbook.types';

/** The first rows each sheet's preview shows. */
const PREVIEW_ROWS = 6;

interface ScheduleExportWorkbookPreviewProps {
  /** Undefined while the export data loads. */
  sheets: WorkbookSheet[] | undefined;
}

/** The workbook's sheets and their first rows, built from the same sheets as the file. */
export function ScheduleExportWorkbookPreview({
  sheets,
}: ScheduleExportWorkbookPreviewProps) {
  return (
    <section aria-label={m.export_preview_label()} className="space-y-3">
      {sheets === undefined ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner />
          {m.export_preview_loading()}
        </p>
      ) : (
        sheets.map((sheet) => (
          <figure key={sheet.name} className="space-y-1">
            <figcaption className="font-medium text-sm">
              {sheet.name}
            </figcaption>
            <div className="overflow-x-auto rounded-md border bg-white">
              <table
                aria-label={sheet.name}
                className="w-full whitespace-nowrap text-xs"
              >
                <thead className="bg-muted">
                  <tr>
                    {sheet.columns.map((column) => (
                      <th key={column} className="px-2 py-1 text-start">
                        {workbookColumnLabel({ column })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                    <tr
                      key={index}
                      className={
                        row.tone === 'cancelled'
                          ? 'text-destructive'
                          : row.tone === 'empty'
                            ? 'text-muted-foreground'
                            : undefined
                      }
                    >
                      {sheet.columns.map((column) => (
                        <td key={column} className="border-t px-2 py-1">
                          {workbookCellText({ row, column })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sheet.rows.length > PREVIEW_ROWS ? (
              <p className="text-muted-foreground text-xs">…</p>
            ) : null}
          </figure>
        ))
      )}
    </section>
  );
}
