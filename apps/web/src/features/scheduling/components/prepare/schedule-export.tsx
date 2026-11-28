import { exportFileName } from '@church/domain-rules/export-file-name';
import { m } from '@church/i18n/messages';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ScheduleExportGroups } from '@/features/scheduling/components/prepare/schedule-export-groups';
import { useSchedule } from '@/features/scheduling/hooks/use-schedule';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { exportApi } from '@/utils/api-instances';

interface ScheduleExportProps {
  ministryId: string;
  cycleId: string;
  /** Opens at once, as when the Event groups tab links back. */
  initialOpen?: boolean;
  /** Called once when it opened at once. */
  onOpened?: () => void;
}

interface SaveFileInput {
  file: Blob;
  name: string;
}

/** Hands a downloaded file to the browser under its own name. */
function saveFile({ file, name }: SaveFileInput) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Exportar: the Schedule's whole Cycle as an A4 PDF table (#1243). The page
 * is only reachable by the Ministry's leaders and ChurchAdmins. The export
 * data's facts drive the Rascunho, unsent-changes and same-name notices (#1245).
 */
export function ScheduleExport({
  ministryId,
  cycleId,
  initialOpen = false,
  onOpened,
}: ScheduleExportProps) {
  const [open, setOpen] = useState(initialOpen);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the first render opens at once
  useEffect(() => {
    if (initialOpen) onOpened?.();
  }, []);
  const { data } = useSchedule({ ministryId, cycleId });
  const { data: exported } = useQuery({
    queryKey: ['schedule-export-data', ministryId, cycleId],
    queryFn: () => exportApi.getScheduleExportData(ministryId, cycleId),
    enabled: open,
  });
  const isDraft = exported?.isDraft ?? false;
  const download = useMutation({
    mutationFn: () =>
      exportApi.getScheduleExportFile(ministryId, cycleId, { format: 'pdf' }),
    onSuccess: (file) => {
      if (!data) return;
      const name = m.export_file_name({
        ministry: data.ministry.name,
        cycle: data.cycle.name,
      });
      const suffixes = isDraft ? [m.export_draft()] : [];
      saveFile({ file, name: `${exportFileName({ name, suffixes })}.pdf` });
      setOpen(false);
    },
    onError: () => toast.error(m.export_download_failed()),
  });
  if (!data) return null;
  const span = `${formatCalendarDateOnly({ value: data.cycle.startDate })} – ${formatCalendarDateOnly({ value: data.cycle.endDate })}`;
  const settings = [
    [m.export_cycle_label(), data.cycle.name],
    [m.export_dates_label(), m.export_whole_cycle({ span })],
    [m.export_format_label(), m.export_format_pdf()],
  ];
  return (
    <>
      <Button
        variant="outline"
        className="min-h-11 md:min-h-8"
        onClick={() => setOpen(true)}
      >
        {m.export_open()}
      </Button>
      <ResponsiveFormSurface
        open={open}
        onOpenChange={(value) => {
          if (!download.isPending) setOpen(value);
        }}
        title={m.export_dialog_title()}
        description={m.export_dialog_description()}
        footer={
          <>
            {isDraft ? (
              <p className="text-muted-foreground text-xs sm:mr-auto sm:self-center">
                {m.export_draft_notice()}
              </p>
            ) : null}
            <Button
              // The file name needs the draft fact, so wait for the data.
              disabled={download.isPending || !exported}
              onClick={() => download.mutate()}
            >
              {download.isPending ? <Spinner /> : null}
              {m.export_download()}
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {settings.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <ScheduleExportGroups ministryId={ministryId} cycleId={cycleId} />
        {exported?.hasUnsentChanges && !isDraft ? (
          <Alert role="status" className="mt-4">
            <AlertDescription>{m.export_unsent_changes()}</AlertDescription>
          </Alert>
        ) : null}
        {exported && exported.duplicateNames.length > 0 ? (
          <Alert role="status" className="mt-4">
            <AlertTitle>{m.export_duplicate_names_title()}</AlertTitle>
            <AlertDescription>
              <ul>
                {exported.duplicateNames.map((names) => (
                  <li key={names.join('|')} className="whitespace-pre-wrap">
                    {names.join(' · ')}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
      </ResponsiveFormSurface>
    </>
  );
}
