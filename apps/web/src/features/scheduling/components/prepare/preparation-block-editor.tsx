import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatDayAndMonth, formatWeekdayShort } from '@church/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate, useSearch } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { blockTitle } from '../participation-prepare.utils';
import {
  initialPreparationDraft,
  preparationBounds,
  preparationGridShifts,
  preparationMinimums,
  preparationSplitProblems,
  revealOffset,
  seedShiftCounts,
  toPreparationSplit,
} from './preparation-block.utils';
import {
  PreparationRefusalDetails,
  preparationRefusal,
} from './preparation-block-refusal';
import { PreparationCatalogPrerequisites } from './preparation-catalog-prerequisites';
import {
  type PrepareListSearch,
  prepareParticipationQuery,
} from './prepare-participation-query';
import { CancelledBadge } from '@/components/cancelled-badge';
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
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { Pending } from '@/components/ui/pending';
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
import {
  isShiftSplitValid,
  type ShiftSplitDraft,
} from '@/features/scheduling/components/shift-split-editor/shift-split.utils';
import { ShiftSplitEditor } from '@/features/scheduling/components/shift-split-editor/shift-split-editor';
import { useSchedule } from '@/features/scheduling/hooks/use-schedule';
import { useMediaQuery } from '@/hooks/use-media-query';
import type {
  GetCycleParticipation200EventsItem,
  GetCycleParticipation200EventsItemEventTimeBlocksItem,
  SaveEventTimeBlockPreparationBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { dayOf, formatTimeOf } from '@/shared/utils/church-time';
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
  const schedules = useSchedule({ ministryId, cycleId });
  const schedule = schedules.data;
  const participation = useQuery({
    queryKey: ['prepare-cycle-participation', ministryId, cycleId],
    queryFn: () => adminApi.getCycleParticipation(cycleId, { ministryId }),
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
  // Prev/next step through the list as filtered on screen (the same cached read), unless
  // this block is not in it (the filter changed since it was opened).
  const search: PrepareListSearch = useSearch({ strict: false });
  const list = useQuery(
    prepareParticipationQuery({ ministryId, cycleId, search }),
  );
  // A cancelled block has no Abrir in the list, so prev/next step over it too.
  const navigable = (events?: GetCycleParticipation200EventsItem[]) =>
    events?.flatMap((candidate) =>
      candidate.eventTimeBlocks.filter(
        (item) =>
          item.eventTimeBlock.id === eventTimeBlockId || !item.cancelled,
      ),
    );
  const listItems = navigable(list.data?.events);
  const items = listItems?.some(
    (item) => item.eventTimeBlock.id === eventTimeBlockId,
  )
    ? listItems
    : (navigable(participation.data?.events) ?? []);
  const blocks = items.map((item) => item.eventTimeBlock);
  const blockIndex = blocks.findIndex(
    (candidate) => candidate.id === eventTimeBlockId,
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
        <Pending label={m.prepare_block_loading()} className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </Pending>
      )
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {loadError}
      <PreparationBlockForm
        key={eventTimeBlockId}
        block={block}
        previousBlock={blocks[blockIndex - 1]}
        nextBlock={blocks[blockIndex + 1]}
        previousServed={items[blockIndex - 1]?.included ?? true}
        nextServed={items[blockIndex + 1]?.included ?? true}
        sourceVersion={participation.dataUpdatedAt}
        cancelled={block.cancelled}
        readOnly={schedule.cycle.state === 'past'}
        participationId={event.participation.id}
        eventTitle={event.event.title}
        context={m.prepare_schedule_title({
          ministry: schedule.ministry.name,
          cycle: schedule.cycle.name,
        })}
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

type EventTimeBlock =
  GetCycleParticipation200EventsItemEventTimeBlocksItem['eventTimeBlock'];

interface NeighbourNames {
  full: string;
  short: string;
}

interface NeighbourButtonProps {
  direction: 'previous' | 'next';
  /** Undefined at either end of the list. */
  names?: NeighbourNames;
  disabled: boolean;
  onClick: () => void;
}

/** Half of the prev/next row: a chevron and a short, truncating name; the full name is its
 * accessible name and tooltip. 44px on touch, dense for a mouse beside the list. */
function NeighbourButton({
  direction,
  names,
  disabled,
  onClick,
}: NeighbourButtonProps) {
  const previous = direction === 'previous';
  const label = names
    ? previous
      ? m.prepare_previous_block_named({ target: names.full })
      : m.prepare_next_block_named({ target: names.full })
    : previous
      ? m.prepare_previous_block()
      : m.prepare_next_block();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      className={cn(
        'min-h-11 min-w-0 px-2 tabular-nums md:pointer-fine:min-h-8',
        !previous && 'ml-auto',
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {previous ? <ChevronLeftIcon /> : null}
      <span className="truncate">{names?.short ?? label}</span>
      {previous ? null : <ChevronRightIcon />}
    </Button>
  );
}

interface NeighbourNameInput {
  start: string;
  served: boolean;
}

interface BlockMomentInput {
  start: string;
  timeZone: string;
}

/** `Dom. 15/11 10:30`: the day and start a block editor names. */
function blockMoment({ start, timeZone }: BlockMomentInput): string {
  const day = dayOf({ value: start, timeZone });
  return `${formatWeekdayShort({ day, locale: getLocale() })} ${formatDayAndMonth({ day })} ${formatTimeOf({ value: start, timeZone })}`;
}

interface SaveTarget {
  thenOpen?: string;
}

interface PreparationBlockFormProps {
  previousBlock?: EventTimeBlock;
  nextBlock?: EventTimeBlock;
  /** False when that neighbour is not served, which its name then says. */
  previousServed: boolean;
  nextServed: boolean;
  sourceVersion: number;
  participationId: string;
  /** Its Event or EventTimeBlock was cancelled: shown read-only, never saved. */
  cancelled: boolean;
  readOnly: boolean;
  ministryId: string;
  cycleId: string;
  block: GetCycleParticipation200EventsItemEventTimeBlocksItem;
  eventTitle: string;
  /** Ministry and Cycle, named where the list and its header are hidden. */
  context: string;
  sectors: HeadcountGridCatalogItem[];
  roles: HeadcountGridCatalogItem[];
}

function PreparationBlockForm({
  previousBlock,
  previousServed,
  nextServed,
  nextBlock,
  sourceVersion,
  participationId,
  cancelled,
  readOnly: cycleReadOnly,
  ministryId,
  cycleId,
  block,
  eventTitle,
  context,
  sectors,
  roles,
}: PreparationBlockFormProps) {
  const readOnly = cycleReadOnly || cancelled;
  const { eventTimeBlock, shifts: savedShifts, included } = block;
  const { id: eventTimeBlockId, label: blockLabel } = eventTimeBlock;
  const previousBlockId = previousBlock?.id;
  const nextBlockId = nextBlock?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const saved = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  // Opening or switching a block moves keyboard focus into its editor, and scrolls the page
  // so the editor's header shows and as much of the block as fits (no motion if reduced).
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const scroller = form.current?.closest('main');
    if (!form.current || !scroller) return;
    const top = revealOffset({
      target: form.current.getBoundingClientRect(),
      view: scroller.getBoundingClientRect(),
    });
    if (top === 0) return;
    const reduce = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    scroller.scrollBy?.({ top, behavior: reduce ? 'auto' : 'smooth' });
  }, []);
  const { churchTimezone } = useTimezone();
  const momentOf = (start: string) =>
    blockMoment({ start, timeZone: churchTimezone });
  const thisDay = dayOf({
    value: eventTimeBlock.startTime,
    timeZone: churchTimezone,
  });
  // Stepping lands on unserved blocks too; their name says so before the click. On screen
  // only the time (plus the day when it differs from this block's); the full name is the label.
  const neighbourNames = ({
    start,
    served,
  }: NeighbourNameInput): NeighbourNames => {
    const suffix = served ? '' : ` · ${m.prepare_not_served()}`;
    const time =
      dayOf({ value: start, timeZone: churchTimezone }) === thisDay
        ? formatTimeOf({ value: start, timeZone: churchTimezone })
        : momentOf(start);
    return { full: `${momentOf(start)}${suffix}`, short: `${time}${suffix}` };
  };
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
  // The last valid split's Shifts: a count typed digit by digit passes through an invalid draft.
  const lastShifts = useRef(shifts);
  useEffect(() => {
    if (shifts.length > 0) lastShifts.current = shifts;
  });
  function changeDraft(next: ShiftSplitDraft) {
    setDraft(next);
    const nextProblems = preparationSplitProblems({
      draft: next,
      block,
      timeZone: churchTimezone,
    });
    if (!isShiftSplitValid({ problems: nextProblems })) return;
    const from = shifts.length > 0 ? shifts : lastShifts.current;
    const to = preparationGridShifts({
      draft: next,
      block,
      timeZone: churchTimezone,
    });
    setValues((current) => seedShiftCounts({ values: current, from, to }));
  }
  const [originalDraft] = useState(() => JSON.stringify(draft));
  const initialOptIn =
    !included &&
    savedShifts.length === 0 &&
    originalDraft === JSON.stringify(draft) &&
    Object.keys(values).length === 0;
  const [baseline] = useState(() => JSON.stringify({ serves, draft, values }));
  const dirty = baseline !== JSON.stringify({ serves, draft, values });
  const isMobile = useMediaQuery('(max-width: 767px)');
  // Below xl the page's own h1 is hidden behind the editor, so the editor is the page.
  const Title = useMediaQuery('(max-width: 1279px)') ? 'h1' : 'h2';
  const backToSchedule = () =>
    navigate({
      to: '/app/schedules/$ministryId/$cycleId',
      params: { ministryId, cycleId },
      search: (previous) => previous,
      hash: `event-time-block-${eventTimeBlockId}`,
    });
  // Counts typed under another split stay in the draft (switching back restores them) but are not saved.
  const otherSplitCounts = Object.entries(values).some(
    ([key, value]) =>
      Number(value) > 0 &&
      !shifts.some((shift) => key.startsWith(`${shift.key}|`)),
  );
  const { entries, invalidKeys } = normalizeHeadcountGrid({
    sectors,
    roles,
    shifts,
    values,
    minimums,
  });
  const save = useMutation({
    /** `thenOpen`: the block to open once saved, instead of the list. */
    mutationFn: (_: SaveTarget) => {
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
    onSuccess: async (_, { thenOpen }) => {
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
      if (thenOpen) openBlock(thenOpen);
      else await backToSchedule();
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
    dirty &&
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
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('[role="dialog"], [role="alertdialog"]')
      ) {
        event.preventDefault();
        void backToSchedule();
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  });
  function openBlock(id: string) {
    void navigate({
      to: '/app/schedules/$ministryId/$cycleId/slots/$timeSlotId',
      params: { ministryId, cycleId, timeSlotId: id },
      search: (previous) => previous,
    });
  }
  return (
    // The page's density: 32px controls on desktop, 44px touch on phones.
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      <form
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) save.mutate({});
        }}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 max-md:pb-20"
      >
        {/* Title, when and the way to its neighbours read as one header. */}
        <header className="flex flex-col gap-1 border-b pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="text-muted-foreground text-xs xl:hidden">
                {context}
              </p>
              {/* Title on its own line, the when under it in muted text, as the page intro. */}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Title
                    ref={heading}
                    tabIndex={-1}
                    aria-describedby="preparation-block-when"
                    className={cn(
                      'font-semibold text-lg outline-none',
                      cancelled && 'text-muted-foreground line-through',
                    )}
                  >
                    {blockTitle({
                      eventTitle,
                      label: blockLabel,
                      startTime: formatTimeOf({
                        value: eventTimeBlock.startTime,
                        timeZone: churchTimezone,
                      }),
                    })}
                  </Title>
                  {cancelled ? <CancelledBadge /> : null}
                </div>
                <p
                  id="preparation-block-when"
                  data-testid="preparation-block-when"
                  className="text-muted-foreground text-sm tabular-nums"
                >
                  {momentOf(eventTimeBlock.startTime)}–
                  {dayOf({
                    value: eventTimeBlock.startTime,
                    timeZone: churchTimezone,
                  }) ===
                  dayOf({
                    value: eventTimeBlock.endTime,
                    timeZone: churchTimezone,
                  })
                    ? formatTimeOf({
                        value: eventTimeBlock.endTime,
                        timeZone: churchTimezone,
                      })
                    : momentOf(eventTimeBlock.endTime)}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              // Dense beside the list for a mouse; a finger keeps 44px.
              className="md:pointer-fine:size-8"
              aria-label={m.prepare_close_block()}
              disabled={save.isPending}
              onClick={() => backToSchedule()}
            >
              <XIcon />
            </Button>
          </div>
          <nav
            aria-label={m.prepare_block_nav_label()}
            // Two halves that never overflow the card: each truncates its own short label.
            className="-mx-2 flex min-w-0 justify-between gap-2"
          >
            <NeighbourButton
              direction="previous"
              names={
                previousBlock
                  ? neighbourNames({
                      start: previousBlock.startTime,
                      served: previousServed,
                    })
                  : undefined
              }
              disabled={!previousBlockId || save.isPending}
              onClick={() => previousBlockId && openBlock(previousBlockId)}
            />
            <NeighbourButton
              direction="next"
              names={
                nextBlock
                  ? neighbourNames({
                      start: nextBlock.startTime,
                      served: nextServed,
                    })
                  : undefined
              }
              disabled={!nextBlockId || save.isPending}
              onClick={() => nextBlockId && openBlock(nextBlockId)}
            />
          </nav>
        </header>
        {/* Beside the list only this part scrolls: the header and footer stay put, nothing hides behind them. */}
        <div className="flex min-w-0 flex-col gap-6 [&_*]:scroll-mb-24">
          {readOnly && (
            <Alert role="status">
              <AlertDescription>
                {cancelled
                  ? m.prepare_block_cancelled()
                  : m.prepare_block_read_only()}
              </AlertDescription>
            </Alert>
          )}
          <label
            htmlFor="preparation-block-serves"
            className="flex min-h-11 items-center gap-3 font-medium text-sm md:min-h-8"
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
              onChange={changeDraft}
              disabled={readOnly || save.isPending}
            />
          )}
          {serves && otherSplitCounts ? (
            <p
              role="status"
              data-testid="preparation-other-split-counts"
              className="-mt-4 text-muted-foreground text-sm"
            >
              {m.prepare_other_split_counts()}
            </p>
          ) : null}
          {serves && (
            <PreparationCatalogPrerequisites
              ministryId={ministryId}
              hasSectors={sectors.length > 0}
              hasRoles={roles.length > 0}
            />
          )}
          {serves && sectors.length > 0 && roles.length > 0 && (
            <section
              aria-labelledby="preparation-block-people"
              className="flex flex-col gap-2"
            >
              <h3
                id="preparation-block-people"
                className="font-semibold text-sm"
              >
                {m.usual_setup_people_needed()}
              </h3>
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
            </section>
          )}
          {serves && initialOptIn && (
            <p className="text-muted-foreground text-sm">
              {m.prepare_block_initial_opt_in()}
            </p>
          )}
          {serves && !initialOptIn && splitValid && entries.length === 0 && (
            <p className="text-pretty text-muted-foreground text-sm">
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
                        m.usual_setup_shift_count_other({
                          count: discardedShifts,
                        }),
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
        </div>
        {/* Always reachable: from tablet up it sticks to the page scroller's bottom edge (past its padding, as the availability answer bar) on an opaque
            band (only the page scrolls, never the panel); on a phone it is pinned (fixed, as the
            house's phone action bars: the shell's main grows there, so sticky never engages).
            The fields' scroll margin keeps a focused one clear of it. */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-10 max-md:flex-nowrap max-md:bg-background max-md:px-(--workspace-pad-x) max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] md:sticky md:bottom-[calc(-1*var(--workspace-pad-y))] md:z-10 md:-mx-5 md:-mb-5 md:rounded-b-[var(--radius-xl)] md:bg-card md:px-5 md:pb-5">
          {!readOnly && !dirty ? (
            <p
              id="preparation-block-save-hint"
              // A phone keeps the pinned bar to one row: the disabled buttons still announce it.
              className="mr-auto text-muted-foreground text-sm max-md:sr-only"
            >
              {m.prepare_save_unchanged()}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => backToSchedule()}
          >
            {m.usual_setup_cancel()}
          </Button>
          {!readOnly && nextBlockId ? (
            // Blocks are prepared in order: save this one and go straight to the next.
            <Button
              type="button"
              variant="outline"
              disabled={!canSave}
              aria-describedby={
                dirty ? undefined : 'preparation-block-save-hint'
              }
              onClick={() => save.mutate({ thenOpen: nextBlockId })}
            >
              {m.prepare_save_and_next()}
            </Button>
          ) : null}
          {!readOnly ? (
            <Button
              type="submit"
              disabled={!canSave}
              aria-describedby={
                dirty ? undefined : 'preparation-block-save-hint'
              }
            >
              {save.isPending ? m.usual_setup_saving() : m.usual_setup_save()}
            </Button>
          ) : null}
        </div>
      </form>
    </FormControlSizeProvider>
  );
}
