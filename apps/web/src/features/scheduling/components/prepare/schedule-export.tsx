import { exportFileName } from '@church/domain-rules/export-file-name';
import { m } from '@church/i18n/messages';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import { toast } from 'sonner';
import { DatePickerField } from '@/components/date-picker-field';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import {
  cycleSpan,
  type ExportCycle,
  ScheduleExportCyclePicker,
} from '@/features/scheduling/components/prepare/schedule-export-cycle-picker';
import {
  type ExportFormat,
  FILE_PARAMS,
  readPages,
  ScheduleExportPreview,
} from '@/features/scheduling/components/prepare/schedule-export-preview';
import { useSchedule } from '@/features/scheduling/hooks/use-schedule';
import { useOnlineState } from '@/features/volunteers/hooks/use-online-state';
import { requestErrorMessage } from '@/shared/utils/request-error-message';
import { exportApi } from '@/utils/api-instances';

interface ScheduleExportProps {
  ministryId: string;
  cycleId: string;
}

const FORMATS = [
  { format: 'cards', label: m.export_format_cards },
  { format: 'pdf', label: m.export_format_pdf },
  { format: 'png', label: m.export_format_table_image },
] as const;

interface DownloadRequest {
  cycle: ExportCycle;
  format: ExportFormat;
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

/** The refusal's translated message; a blob download carries it as a Blob. */
async function refusalMessage(error: unknown): Promise<string | undefined> {
  if (!isAxiosError(error) || !(error.response?.data instanceof Blob)) {
    return undefined;
  }
  try {
    const { message } = JSON.parse(await error.response.data.text());
    return typeof message === 'string' && message ? message : undefined;
  } catch {
    return undefined;
  }
}

interface ExportRange {
  from: string;
  to: string;
}

/**
 * Exportar: the Schedule as an A4 PDF table (#1243) or one table image under
 * a live preview of the file (#1244), for any Cycle with a Schedule and
 * optionally only some of its dates (#1246). The page is only
 * reachable by the Ministry's leaders and ChurchAdmins. The export data's
 * facts drive the Rascunho, unsent-changes and same-name notices (#1245).
 */
export function ScheduleExport({ ministryId, cycleId }: ScheduleExportProps) {
  const [open, setOpen] = useState(false);
  const [cycle, setCycle] = useState<ExportCycle | null>(null);
  // Null: the whole Cycle.
  const [range, setRange] = useState<ExportRange | null>(null);
  const [format, setFormat] = useState<ExportFormat>('cards');
  const online = useOnlineState();
  const { data } = useSchedule({ ministryId, cycleId });
  const selectedId = cycle?.id ?? cycleId;
  const { data: exported, error: refused } = useQuery({
    queryKey: ['schedule-export-data', ministryId, selectedId, range],
    queryFn: () =>
      range
        ? exportApi.getScheduleExportData(ministryId, selectedId, range)
        : exportApi.getScheduleExportData(ministryId, selectedId),
    enabled: open,
  });
  const isDraft = exported?.isDraft ?? false;
  const download = useMutation({
    mutationFn: async (chosen: DownloadRequest) => {
      const params = { ...FILE_PARAMS[chosen.format], ...range };
      try {
        if (chosen.format !== 'cards') {
          return [
            await exportApi.getScheduleExportFile(
              ministryId,
              chosen.cycle.id,
              params,
            ),
          ];
        }
        return await readPages({
          read: (page) =>
            exportApi.getScheduleExportFile(ministryId, chosen.cycle.id, {
              ...params,
              page,
            }),
        });
      } catch (error) {
        throw new Error(
          (await refusalMessage(error)) ?? m.export_download_failed(),
        );
      }
    },
    onSuccess: (files, chosen) => {
      if (!data) return;
      const name = m.export_file_name({
        ministry: data.ministry.name,
        cycle: chosen.cycle.name,
      });
      const draft = isDraft ? [m.export_draft()] : [];
      const extension = FILE_PARAMS[chosen.format].format;
      for (const [index, file] of files.entries()) {
        const part =
          files.length > 1
            ? [
                m.export_image_part({
                  part: String(index + 1),
                  parts: String(files.length),
                }),
              ]
            : [];
        const suffixes = [...draft, ...part];
        saveFile({
          file,
          name: `${exportFileName({ name, suffixes })}.${extension}`,
        });
      }
      setOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });
  if (!data) return null;
  const selected = cycle ?? { ...data.cycle, id: cycleId };
  const span = cycleSpan({ cycle: selected });
  return (
    <>
      <Button
        variant="outline"
        className="min-h-11 md:min-h-8"
        onClick={() => {
          setCycle(null);
          setRange(null);
          setOpen(true);
        }}
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
              disabled={download.isPending || !exported || !online}
              onClick={() => download.mutate({ cycle: selected, format })}
            >
              {download.isPending ? <Spinner /> : null}
              {m.export_download()}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground">{m.export_cycle_label()}</p>
            <ScheduleExportCyclePicker
              ministryId={ministryId}
              value={selected}
              onChange={(next) => {
                setCycle(next);
                setRange(null);
              }}
            />
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground">{m.export_dates_label()}</p>
            <RadioGroup
              aria-label={m.export_dates_label()}
              value={range ? 'pick' : 'whole'}
              onValueChange={(value) =>
                setRange(
                  value === 'pick'
                    ? { from: selected.startDate, to: selected.endDate }
                    : null,
                )
              }
            >
              <Label className="font-normal">
                <RadioGroupItem value="whole" />
                {m.export_whole_cycle({ span })}
              </Label>
              <Label className="font-normal">
                <RadioGroupItem value="pick" />
                {m.export_pick_dates()}
              </Label>
            </RadioGroup>
            {range ? (
              <div className="grid grid-cols-2 gap-2">
                {(['from', 'to'] as const).map((side) => (
                  <div key={side} className="space-y-1">
                    <Label id={`schedule-export-${side}`}>
                      {side === 'from' ? m.export_from() : m.export_to()}
                    </Label>
                    <DatePickerField
                      aria-labelledby={`schedule-export-${side}`}
                      value={range[side]}
                      onChange={(day) => setRange({ ...range, [side]: day })}
                      minDate={selected.startDate}
                      maxDate={selected.endDate}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground">{m.export_format_label()}</p>
            <RadioGroup
              aria-label={m.export_format_label()}
              value={format}
              onValueChange={(value) => {
                const option = FORMATS.find((item) => item.format === value);
                if (option) setFormat(option.format);
              }}
            >
              {FORMATS.map((option) => (
                <Label key={option.format} className="font-normal">
                  <RadioGroupItem value={option.format} />
                  {option.label()}
                </Label>
              ))}
            </RadioGroup>
          </div>
        </div>
        {refused ? (
          <Alert role="alert" variant="destructive" className="mt-4">
            <AlertDescription>{requestErrorMessage(refused)}</AlertDescription>
          </Alert>
        ) : null}
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
        {format === 'png' ? (
          <Alert role="status" className="mt-4">
            <AlertDescription>{m.export_table_image_notice()}</AlertDescription>
          </Alert>
        ) : null}
        <div className="mt-4">
          {!online ? (
            <p className="text-muted-foreground text-sm">
              {m.export_offline()}
            </p>
          ) : refused ? null : (
            <ScheduleExportPreview
              ministryId={ministryId}
              cycleId={selected.id}
              format={format}
              range={range}
            />
          )}
        </div>
      </ResponsiveFormSurface>
    </>
  );
}
