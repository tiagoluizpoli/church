import { exportFileName } from '@church/domain-rules/export-file-name';
import { m } from '@church/i18n/messages';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { ScheduleExportPreview } from '@/features/scheduling/components/prepare/schedule-export-preview';
import { useSchedule } from '@/features/scheduling/hooks/use-schedule';
import { useOnlineState } from '@/features/volunteers/hooks/use-online-state';
import type { GetScheduleExportFileFormat } from '@/infrastructure/api/churchAPI.schemas';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { exportApi } from '@/utils/api-instances';

interface ScheduleExportProps {
  ministryId: string;
  cycleId: string;
}

const FORMATS = [
  { format: 'pdf', label: m.export_format_pdf },
  { format: 'png', label: m.export_format_table_image },
] as const;

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
 * Exportar: the Schedule's whole Cycle as an A4 PDF table (#1243) or one
 * table image, under a live preview of the file (#1244). The page is only
 * reachable by the Ministry's leaders and ChurchAdmins.
 */
export function ScheduleExport({ ministryId, cycleId }: ScheduleExportProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<GetScheduleExportFileFormat>('pdf');
  const online = useOnlineState();
  const { data } = useSchedule({ ministryId, cycleId });
  const download = useMutation({
    mutationFn: (fileFormat: GetScheduleExportFileFormat) =>
      exportApi.getScheduleExportFile(ministryId, cycleId, {
        format: fileFormat,
      }),
    onSuccess: (file, fileFormat) => {
      if (!data) return;
      const name = m.export_file_name({
        ministry: data.ministry.name,
        cycle: data.cycle.name,
      });
      saveFile({ file, name: `${exportFileName({ name })}.${fileFormat}` });
      setOpen(false);
    },
    onError: () => toast.error(m.export_download_failed()),
  });
  if (!data) return null;
  const span = `${formatCalendarDateOnly({ value: data.cycle.startDate })} – ${formatCalendarDateOnly({ value: data.cycle.endDate })}`;
  const settings = [
    [m.export_cycle_label(), data.cycle.name],
    [m.export_dates_label(), m.export_whole_cycle({ span })],
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
          <Button
            disabled={download.isPending || !online}
            onClick={() => download.mutate(format)}
          >
            {download.isPending ? <Spinner /> : null}
            {m.export_download()}
          </Button>
        }
      >
        <div className="space-y-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {settings.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
            <dt id="schedule-export-format" className="text-muted-foreground">
              {m.export_format_label()}
            </dt>
            <dd>
              <RadioGroup
                aria-labelledby="schedule-export-format"
                className="gap-0"
                value={format}
                onValueChange={(value) => {
                  const option = FORMATS.find((item) => item.format === value);
                  if (option) setFormat(option.format);
                }}
              >
                {FORMATS.map((option) => (
                  <Label
                    key={option.format}
                    htmlFor={`schedule-export-format-${option.format}`}
                    className="flex min-h-11 items-center gap-3 font-normal md:min-h-8"
                  >
                    <RadioGroupItem
                      value={option.format}
                      id={`schedule-export-format-${option.format}`}
                    />
                    {option.label()}
                  </Label>
                ))}
              </RadioGroup>
            </dd>
          </dl>
          {format === 'png' ? (
            <Alert>
              <AlertDescription>
                {m.export_table_image_notice()}
              </AlertDescription>
            </Alert>
          ) : null}
          {online ? (
            <ScheduleExportPreview
              ministryId={ministryId}
              cycleId={cycleId}
              format={format}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              {m.export_offline()}
            </p>
          )}
        </div>
      </ResponsiveFormSurface>
    </>
  );
}
