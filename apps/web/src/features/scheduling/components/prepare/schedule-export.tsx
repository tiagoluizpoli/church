import { exportFileName } from '@church/domain-rules/export-file-name';
import { m } from '@church/i18n/messages';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DatePickerField } from '@/components/date-picker-field';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { useEventGroups } from '@/features/ministries/ministry-queries';
import { useMinistryRoles } from '@/features/ministries/role-queries';
import {
  cycleSpan,
  type ExportCycle,
  ScheduleExportCyclePicker,
} from '@/features/scheduling/components/prepare/schedule-export-cycle-picker';
import { ScheduleExportGroups } from '@/features/scheduling/components/prepare/schedule-export-groups';
import { exportPartName } from '@/features/scheduling/components/prepare/schedule-export-part-name';
import { ScheduleExportPreview } from '@/features/scheduling/components/prepare/schedule-export-preview';
import { useSchedule } from '@/features/scheduling/hooks/use-schedule';
import { useOnlineState } from '@/features/volunteers/hooks/use-online-state';
import type {
  GetScheduleExportData200PartsItem,
  GetScheduleExportDataSplit,
  GetScheduleExportFileFormat,
} from '@/infrastructure/api/churchAPI.schemas';
import { requestErrorMessage } from '@/shared/utils/request-error-message';
import { exportApi } from '@/utils/api-instances';

interface ScheduleExportProps {
  ministryId: string;
  cycleId: string;
  /** Opens at once, as when the Event groups tab links back. */
  initialOpen?: boolean;
  /** Called once when it opened at once. */
  onOpened?: () => void;
}

const FORMATS = [
  { format: 'pdf', label: m.export_format_pdf },
  { format: 'png', label: m.export_format_table_image },
] as const;

const SPLITS = [
  { split: 'none', label: m.export_split_none },
  { split: 'group', label: m.export_split_group },
  { split: 'week', label: m.export_split_week },
  { split: 'sector', label: m.export_split_sector },
  { split: 'role', label: m.export_split_role },
] as const;

interface DownloadRequest {
  cycle: ExportCycle;
  format: GetScheduleExportFileFormat;
  split: GetScheduleExportDataSplit;
  parts: GetScheduleExportData200PartsItem[];
}

/** One file to download, and the part it holds alone, if any. */
interface DownloadedFile {
  file: Blob;
  part?: GetScheduleExportData200PartsItem;
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

interface SplitQueryInput {
  split: GetScheduleExportDataSplit;
}

/** The split as a query: left out when it keeps one part, the server's default. */
function splitQuery({ split }: SplitQueryInput) {
  return split === 'none' ? {} : { split };
}

/**
 * Exportar: the Schedule as an A4 PDF table (#1243) or one table image under
 * a live preview of the file (#1244), for any Cycle with a Schedule and
 * optionally only some of its dates (#1246), split into parts by Separar
 * (#1248): a PDF page run per part, a table image per part. The page is only
 * reachable by the Ministry's leaders and ChurchAdmins. The export data's
 * facts drive the Rascunho, unsent-changes and same-name notices (#1245).
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
  const [cycle, setCycle] = useState<ExportCycle | null>(null);
  // Null: the whole Cycle.
  const [range, setRange] = useState<ExportRange | null>(null);
  const [format, setFormat] = useState<GetScheduleExportFileFormat>('pdf');
  // Null: the Ministry's default, never remembered between exports.
  const [split, setSplit] = useState<GetScheduleExportDataSplit | null>(null);
  const online = useOnlineState();
  const { data } = useSchedule({ ministryId, cycleId });
  const groups = useEventGroups({ ministryId });
  const { data: roles } = useMinistryRoles({ ministryId });
  const hasGroups = (groups.data?.groups.length ?? 0) > 0;
  const splits = SPLITS.filter(
    (option) =>
      (option.split !== 'group' || hasGroups) &&
      (option.split !== 'role' || (roles?.roles.length ?? 0) > 1),
  );
  const chosenSplit = split ?? (hasGroups ? 'group' : 'none');
  const selectedId = cycle?.id ?? cycleId;
  const query = { ...range, ...splitQuery({ split: chosenSplit }) };
  const { data: exported, error: refused } = useQuery({
    queryKey: ['schedule-export-data', ministryId, selectedId, query],
    queryFn: () =>
      Object.keys(query).length > 0
        ? exportApi.getScheduleExportData(ministryId, selectedId, query)
        : exportApi.getScheduleExportData(ministryId, selectedId),
    // The default split waits for the Ministry's Event groups.
    enabled: open && !groups.isPending,
  });
  const isDraft = exported?.isDraft ?? false;
  const download = useMutation({
    mutationFn: async (chosen: DownloadRequest): Promise<DownloadedFile[]> => {
      const params = {
        format: chosen.format,
        ...range,
        ...splitQuery(chosen),
      };
      // A PDF holds every part; a split's table image is one PNG per part.
      const parts =
        chosen.format === 'png' && chosen.split !== 'none' ? chosen.parts : [];
      try {
        if (parts.length === 0) {
          const file = await exportApi.getScheduleExportFile(
            ministryId,
            chosen.cycle.id,
            params,
          );
          return [{ file }];
        }
        const files: DownloadedFile[] = [];
        for (const [index, part] of parts.entries()) {
          const file = await exportApi.getScheduleExportFile(
            ministryId,
            chosen.cycle.id,
            { ...params, part: index + 1 },
          );
          files.push({ file, part });
        }
        return files;
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
      for (const { file, part } of files) {
        const partName = part ? exportPartName({ part }) : null;
        const suffixes = [
          ...(isDraft ? [m.export_draft()] : []),
          ...(partName ? [partName] : []),
        ];
        saveFile({
          file,
          name: `${exportFileName({ name, suffixes })}.${chosen.format}`,
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
          setSplit(null);
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
              onClick={() =>
                download.mutate({
                  cycle: selected,
                  format,
                  split: chosenSplit,
                  parts: exported?.parts ?? [],
                })
              }
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
          <div className="space-y-2">
            <p className="text-muted-foreground">{m.export_split_label()}</p>
            <RadioGroup
              aria-label={m.export_split_label()}
              value={chosenSplit}
              onValueChange={(value) => {
                const option = SPLITS.find((item) => item.split === value);
                if (option) setSplit(option.split);
              }}
            >
              {splits.map((option) => (
                <Label key={option.split} className="font-normal">
                  <RadioGroupItem value={option.split} />
                  {option.label()}
                </Label>
              ))}
            </RadioGroup>
          </div>
          <ScheduleExportGroups ministryId={ministryId} cycleId={cycleId} />
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
          ) : refused || groups.isPending ? null : (
            <ScheduleExportPreview
              ministryId={ministryId}
              cycleId={selected.id}
              format={format}
              range={range}
              {...splitQuery({ split: chosenSplit })}
              partNames={(exported?.parts ?? []).map((part) =>
                exportPartName({ part }),
              )}
            />
          )}
        </div>
      </ResponsiveFormSurface>
    </>
  );
}
