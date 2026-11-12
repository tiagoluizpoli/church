import { m } from '@church/i18n/messages';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  initialPreparationDraft,
  preparationBounds,
  preparationGridShifts,
  preparationMinimums,
  preparationSplitProblems,
  toPreparationSplit,
} from './preparation-block.utils';
import {
  PreparationRefusalDetails,
  preparationRefusal,
} from './preparation-block-refusal';
import { PreparationCatalogPrerequisites } from './preparation-catalog-prerequisites';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useSectorList } from '@/features/ministries/ministry-queries';
import { useMinistryRoles } from '@/features/ministries/role-queries';
import {
  HeadcountGrid,
  type HeadcountGridCatalogItem,
  type HeadcountGridMinimums,
  type HeadcountGridValues,
  headcountGridKey,
  normalizeHeadcountGrid,
} from '@/features/scheduling/components/headcount-grid/headcount-grid';
import { isShiftSplitValid } from '@/features/scheduling/components/shift-split-editor/shift-split.utils';
import { ShiftSplitEditor } from '@/features/scheduling/components/shift-split-editor/shift-split-editor';
import type {
  GetCycleParticipation200EventsItemEventTimeBlocksItem,
  SaveEventTimeBlockPreparationBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { pluralMessage } from '@/shared/utils/plural';
import { adminApi } from '@/utils/api-instances';

export interface PreparationBlockEditorProps {
  ministryId: string;
  cycleId: string;
  eventTimeBlockId: string;
}

export function PreparationBlockEditor({
  ministryId,
  cycleId,
  eventTimeBlockId,
}: PreparationBlockEditorProps) {
  const schedules = useQuery({
    queryKey: ['prepare-schedules'],
    queryFn: () => adminApi.listSchedules(),
    retry: false,
  });
  const schedule = schedules.data?.schedules.find(
    (row) => row.ministry.id === ministryId && row.cycle.id === cycleId,
  );
  const participation = useQuery({
    queryKey: ['prepare-cycle-participation', ministryId, cycleId],
    queryFn: () => adminApi.getCycleParticipation(cycleId, { ministryId }),
    retry: false,
  });
  const sectors = useSectorList({ ministryId });
  const roles = useMinistryRoles({ ministryId });
  const event = participation.data?.events.find((candidate) =>
    candidate.eventTimeBlocks.some(
      (block) => block.eventTimeBlock.id === eventTimeBlockId,
    ),
  );
  const block = event?.eventTimeBlocks.find(
    (candidate) => candidate.eventTimeBlock.id === eventTimeBlockId,
  );
  const reads = [schedules, participation, sectors, roles];
  const statuses = reads.map((read) =>
    isAxiosError(read.error) ? read.error.response?.status : undefined,
  );
  if (
    statuses.includes(404) ||
    (schedules.isSuccess && !schedule) ||
    (participation.isSuccess && !block)
  ) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{m.error_not_found()}</AlertDescription>
      </Alert>
    );
  }
  if (statuses.includes(403))
    return (
      <Alert variant="destructive">
        <AlertDescription>{m.shell_no_access()}</AlertDescription>
      </Alert>
    );
  const failure = reads.some((read) => read.isError);
  const loadError = failure && (
    <Alert variant="destructive">
      <AlertDescription>
        <p>{m.prepare_block_load_failed()}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            for (const read of reads) if (read.isError) void read.refetch();
          }}
        >
          {m.schedules_retry()}
        </Button>
      </AlertDescription>
    </Alert>
  );
  if (!schedule || !block || !event || !sectors.data || !roles.data)
    return (
      loadError || (
        <div aria-busy="true">
          <Skeleton className="h-24 w-full" />
        </div>
      )
    );
  return (
    <div className="flex flex-col gap-4">
      {loadError}
      <PreparationBlockForm
        key={eventTimeBlockId}
        block={block}
        sourceVersion={participation.dataUpdatedAt}
        readOnly={schedule.cycle.state === 'past'}
        participationId={event.participation.id}
        eventTitle={event.event.title}
        ministryId={ministryId}
        cycleId={cycleId}
        sectors={sectors.data.sectors}
        roles={roles.data.roles}
      />
    </div>
  );
}

interface RefusedMinimums {
  sourceVersion: number;
  values: HeadcountGridMinimums;
}

interface PreparationBlockFormProps {
  sourceVersion: number;
  participationId: string;
  readOnly: boolean;
  ministryId: string;
  cycleId: string;
  block: GetCycleParticipation200EventsItemEventTimeBlocksItem;
  eventTitle: string;
  sectors: HeadcountGridCatalogItem[];
  roles: HeadcountGridCatalogItem[];
}

function PreparationBlockForm({
  sourceVersion,
  participationId,
  readOnly,
  ministryId,
  cycleId,
  block,
  eventTitle,
  sectors,
  roles,
}: PreparationBlockFormProps) {
  const { eventTimeBlock, shifts: savedShifts, included } = block;
  const { id: eventTimeBlockId, label: blockLabel } = eventTimeBlock;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const saved = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // Opening or switching a block moves keyboard focus into its editor.
  useEffect(() => heading.current?.focus(), []);
  const { churchTimezone } = useTimezone();
  const [confirmOptOut, setConfirmOptOut] = useState(false);
  const [serves, setServes] = useState(included);
  const bounds = preparationBounds({ block, timeZone: churchTimezone });
  const [draft, setDraft] = useState(() =>
    initialPreparationDraft({ block, timeZone: churchTimezone }),
  );
  const problems = preparationSplitProblems({
    draft,
    block,
    timeZone: churchTimezone,
  });
  const splitValid = isShiftSplitValid({ problems });
  const shifts = splitValid
    ? preparationGridShifts({ draft, block, timeZone: churchTimezone })
    : [];
  const [refusedMinimums, setRefusedMinimums] = useState<RefusedMinimums>();
  const minimums = {
    ...preparationMinimums({ block, shifts }),
    ...(refusedMinimums?.sourceVersion === sourceVersion
      ? refusedMinimums.values
      : {}),
  };
  const [values, setValues] = useState<HeadcountGridValues>(() =>
    Object.fromEntries(
      savedShifts.flatMap((shift, index) =>
        shift.requirements.map((requirement) => [
          headcountGridKey({
            shiftKey: shifts[index]?.key ?? shift.id,
            sectorId: requirement.sectorId,
            roleId: requirement.roleId,
          }),
          String(requirement.peopleNeeded),
        ]),
      ),
    ),
  );
  const [originalDraft] = useState(() => JSON.stringify(draft));
  const initialOptIn =
    !included &&
    savedShifts.length === 0 &&
    originalDraft === JSON.stringify(draft) &&
    Object.keys(values).length === 0;
  const [baseline] = useState(() => JSON.stringify({ serves, draft, values }));
  const dirty = baseline !== JSON.stringify({ serves, draft, values });
  const backToSchedule = () =>
    navigate({
      to: '/schedules/$ministryId/$cycleId',
      params: { ministryId, cycleId },
      hash: `event-time-block-${eventTimeBlockId}`,
    });
  const { entries, invalidKeys } = normalizeHeadcountGrid({
    sectors,
    roles,
    shifts,
    values,
    minimums,
  });
  const save = useMutation({
    mutationFn: () => {
      let body: SaveEventTimeBlockPreparationBody;
      if (!serves) body = { serves: false };
      else if (initialOptIn) body = { serves: true };
      else {
        const shiftSplit = toPreparationSplit({
          draft,
          block,
          timeZone: churchTimezone,
        });
        const headcounts = entries.map(({ shiftKey, ...entry }) => ({
          ...entry,
          shiftIndex: shifts.findIndex((shift) => shift.key === shiftKey),
        }));
        body = { serves, shiftSplit, headcounts };
      }
      return adminApi.saveEventTimeBlockPreparation(
        participationId,
        eventTimeBlockId,
        body,
      );
    },
    onError: (error) => {
      const refusal = preparationRefusal({ error });
      if (refusal?.error === 'ILLEGAL_STATE_TRANSITION') {
        void queryClient.invalidateQueries({
          queryKey: ['prepare-cycle-participation', ministryId, cycleId],
        });
        void queryClient.invalidateQueries({ queryKey: ['prepare-schedules'] });
      }
      const floors = refusal?.headcountFloors ?? [];
      setRefusedMinimums((current) => ({
        sourceVersion,
        values: {
          ...(current?.sourceVersion === sourceVersion ? current.values : {}),
          ...Object.fromEntries(
            floors.flatMap((floor) => {
              const shift = shifts.find(
                (candidate) => candidate.savedShiftId === floor.shiftId,
              );
              return shift
                ? [
                    [
                      headcountGridKey({
                        shiftKey: shift.key,
                        sectorId: floor.sectorId,
                        roleId: floor.roleId,
                      }),
                      floor.assignedCount,
                    ],
                  ]
                : [];
            }),
          ),
        },
      }));
    },
    onSuccess: async () => {
      saved.current = true;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['prepare-cycle-participation', ministryId, cycleId],
        }),
        queryClient.invalidateQueries({ queryKey: ['prepare-schedules'] }),
        // The retained list's Ask preview and answer status count the
        // Shifts just saved.
        queryClient.invalidateQueries({
          queryKey: ['prepare-ask-preview', ministryId, cycleId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['availability-status', cycleId, ministryId],
        }),
      ]);
      toast.success(m.prepare_block_saved());
      await backToSchedule();
    },
  });
  const hasCatalogs = sectors.length > 0 && roles.length > 0;
  const canDescribeDraft =
    splitValid && invalidKeys.length === 0 && hasCatalogs;
  const discardedShifts = canDescribeDraft ? shifts.length : savedShifts.length;
  const draftPeople = entries.reduce(
    (total, entry) => total + entry.peopleNeeded,
    0,
  );
  const savedPeople = savedShifts.reduce(
    (total, shift) =>
      total +
      shift.requirements.reduce(
        (sum, requirement) => sum + requirement.peopleNeeded,
        0,
      ),
    0,
  );
  const discardedPeople = canDescribeDraft ? draftPeople : savedPeople;
  const canSave =
    !readOnly &&
    !save.isPending &&
    (!serves ||
      (splitValid &&
        hasCatalogs &&
        (entries.length > 0 || initialOptIn) &&
        invalidKeys.length === 0));
  const blocker = useBlocker({
    shouldBlockFn: () => (dirty || save.isPending) && !saved.current,
    enableBeforeUnload: () => (dirty || save.isPending) && !saved.current,
    withResolver: true,
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) save.mutate();
      }}
      className="flex max-w-2xl flex-col gap-5"
    >
      <h2
        ref={heading}
        tabIndex={-1}
        className="font-semibold text-lg outline-none"
      >
        {eventTitle} · {blockLabel}
      </h2>
      {readOnly && (
        <Alert role="status">
          <AlertDescription>{m.prepare_block_read_only()}</AlertDescription>
        </Alert>
      )}
      <label
        htmlFor="preparation-block-serves"
        className="flex items-center gap-3"
      >
        <Checkbox
          id="preparation-block-serves"
          disabled={readOnly || save.isPending}
          checked={serves}
          onCheckedChange={(checked) => {
            if (!checked && (shifts.length > 0 || savedShifts.length > 0))
              setConfirmOptOut(true);
            else setServes(checked);
          }}
        />
        {m.usual_setup_serves_label()}
      </label>
      {serves && (
        <ShiftSplitEditor
          draft={draft}
          block={bounds}
          problems={problems}
          onChange={setDraft}
          disabled={readOnly || save.isPending}
        />
      )}
      {serves && (
        <PreparationCatalogPrerequisites
          ministryId={ministryId}
          hasSectors={sectors.length > 0}
          hasRoles={roles.length > 0}
        />
      )}
      {serves && sectors.length > 0 && roles.length > 0 && (
        <HeadcountGrid
          sectors={sectors}
          roles={roles}
          shifts={shifts}
          values={values}
          minimums={minimums}
          disabled={readOnly || save.isPending}
          onChange={({ value, ...cell }) =>
            setValues((current) => ({
              ...current,
              [headcountGridKey(cell)]: value,
            }))
          }
        />
      )}
      {serves && initialOptIn && (
        <p className="text-muted-foreground text-sm">
          {m.prepare_block_initial_opt_in()}
        </p>
      )}
      {serves && !initialOptIn && splitValid && entries.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {m.error_validation_usual_setup_empty()}
        </p>
      )}
      <PreparationRefusalDetails
        error={save.error}
        isError={save.isError}
        block={block}
        shifts={shifts}
        timeZone={churchTimezone}
      />
      <AlertDialog open={blocker.status === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {save.isPending
                ? m.usual_setup_saving()
                : m.prepare_block_leave_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {save.isPending
                ? m.prepare_block_pending_navigation()
                : m.prepare_block_leave_description()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              {m.prepare_block_stay()}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={save.isPending}
              onClick={() => blocker.proceed?.()}
            >
              {m.prepare_block_leave()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmOptOut} onOpenChange={setConfirmOptOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.prepare_block_confirm_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.prepare_block_confirm_counts({
                shifts: pluralMessage({
                  count: discardedShifts,
                  one: m.usual_setup_shift_count_one,
                  other: () =>
                    m.usual_setup_shift_count_other({ count: discardedShifts }),
                }),
                people: pluralMessage({
                  count: discardedPeople,
                  one: m.usual_setup_people_count_one,
                  other: () =>
                    m.usual_setup_people_count_other({
                      count: discardedPeople,
                    }),
                }),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmOptOut(false)}>
              {m.usual_setup_cancel()}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setServes(false);
                setConfirmOptOut(false);
              }}
            >
              {m.prepare_block_confirm_action()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!readOnly && (
        <Button type="submit" disabled={!canSave}>
          {save.isPending ? m.usual_setup_saving() : m.usual_setup_save()}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={save.isPending}
        onClick={() => backToSchedule()}
      >
        {m.usual_setup_cancel()}
      </Button>
    </form>
  );
}
