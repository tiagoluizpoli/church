import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  type CalendarDay,
  calendarDaysBetween,
  compareInstants,
  formatCalendarDayWithWeekday,
  formatDayLabel,
  now,
  parseCalendarDay,
  parseInstant,
  today,
} from '@church/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  Lock,
} from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { z } from 'zod';
import { useLocalAvailabilityDraft } from '../hooks/use-local-availability-draft';
import {
  buildUnavailableShiftsBody,
  createInitialUnavailableShiftDraft,
  getShiftDate,
  toggleShiftUnavailable,
  type UnavailableShiftDraft,
} from '../lib/unavailable-shifts';
import { HeaderStatChip } from '@/components/header-stat-chip';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { useMediaQuery } from '@/hooks/use-media-query';
import type {
  GetAvailabilityCheck200,
  GetAvailabilityCheck200ShiftsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  dayOf,
  formatCalendarDateOnly,
  formatDayOf,
  formatInstantRangeOf,
  formatTimeOf,
} from '@/shared/utils/church-time';
import { volunteerApi } from '@/utils/api-instances';

const publishedRefusalSchema = z.object({
  error: z.literal('SHIFT_PUBLISHED'),
  shiftIds: z.array(z.string()),
});

export interface AvailabilityDetailPageProps {
  checkId: string;
  onAnswered: () => void | Promise<void>;
}

/** Secondary text on this volunteer screen sits above the AA minimum (PRODUCT.md). */
const SECONDARY_TONE = 'text-foreground/75';

const LINK_CLASS =
  'font-medium text-primary underline underline-offset-3 hover:no-underline';

const NO_MARKS: UnavailableShiftDraft = {
  markedShiftIds: new Set(),
  wholeDayDates: new Set(),
};

interface ShiftTimesInput {
  shift: GetAvailabilityCheck200ShiftsItem;
  timeZone: string;
}

/** `10:30 – 12:30` under its day heading; the full range only when it crosses midnight. */
function formatShiftTimes({ shift, timeZone }: ShiftTimesInput): string {
  const start = shift.startTime;
  const end = shift.endTime;
  return dayOf({ value: start, timeZone }) === dayOf({ value: end, timeZone })
    ? `${formatTimeOf({ value: start, timeZone })} – ${formatTimeOf({ value: end, timeZone })}`
    : formatInstantRangeOf({ start, end, timeZone });
}

type DayEntry = [CalendarDay, GetAvailabilityCheck200ShiftsItem[]];

interface DayFold {
  entries: DayEntry[];
  note?: ReactNode;
  summary: string;
}

interface DeadlineCountdownInput {
  daysLeft: number;
}

function formatDeadlineCountdown({ daysLeft }: DeadlineCountdownInput): string {
  if (daysLeft === 0) return m.availability_detail_due_today();
  if (daysLeft === 1) return m.availability_detail_due_in_one();
  return m.availability_detail_due_in({ days: daysLeft });
}

interface AvailabilityAnswerProps {
  check: GetAvailabilityCheck200;
  /** Mobile answers with 44px targets; desktop at the 32px density (DESIGN.md Density). */
  touch: boolean;
  hasFreshDetail: boolean;
  userId: string;
  onAnswered: () => void | Promise<void>;
}

function AvailabilityAnswer({
  check,
  touch,
  hasFreshDetail,
  userId,
  onAnswered,
}: AvailabilityAnswerProps) {
  const { churchTimezone } = useTimezone();
  const idPrefix = useId();
  const editableShifts = check.shifts.filter((shift) => !shift.published);
  const {
    draft,
    setDraft,
    restored,
    discard,
    clear,
    hasUnsentChanges,
    cleared,
  } = useLocalAvailabilityDraft({
    check,
    hasFreshDetail,
    userId,
    timeZone: churchTimezone,
  });
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsentChanges && !cleared.current,
    enableBeforeUnload: () => hasUnsentChanges && !cleared.current,
    withResolver: true,
  });
  // The marks the "everything available" shortcut cleared, until the next edit.
  const [undoDraft, setUndoDraft] = useState<UnavailableShiftDraft | null>(
    null,
  );
  const queryClient = useQueryClient();
  const [publishedRefusal, setPublishedRefusal] = useState(false);
  const confirmed = check.state === 'confirmed';
  const answer = useMutation({
    mutationFn: () => {
      const body = buildUnavailableShiftsBody({ draft });
      // A whole day containing a published Shift must be sent as individual marks.
      body.wholeDayDates = body.wholeDayDates?.filter((day) =>
        check.shifts.every(
          (shift) =>
            !shift.published ||
            getShiftDate({ shift, timeZone: churchTimezone }) !== day,
        ),
      );
      body.shiftIds = body.shiftIds.filter((id) =>
        editableShifts.some((shift) => shift.shiftId === id),
      );
      return volunteerApi.answerAvailabilityCheck(check.id, body);
    },
    onMutate: () => setPublishedRefusal(false),
    onError: async (error) => {
      const data: unknown = isAxiosError(error)
        ? error.response?.data
        : undefined;
      const refusal = publishedRefusalSchema.safeParse(data);
      if (!refusal.success) return;
      setPublishedRefusal(true);
      const { shiftIds } = refusal.data;
      const refusedIds = new Set(shiftIds);
      const pruneDraft = (detail: GetAvailabilityCheck200) => {
        setDraft((current) => {
          const remainingShifts = detail.shifts
            .filter(
              (shift) => !shift.published && !refusedIds.has(shift.shiftId),
            )
            .map((shift) => ({
              ...shift,
              available: !current.markedShiftIds.has(shift.shiftId),
            }));
          return createInitialUnavailableShiftDraft({
            shifts: remainingShifts,
            timeZone: churchTimezone,
          });
        });
      };
      pruneDraft(check);
      await queryClient.invalidateQueries({
        queryKey: ['availability-check', check.id],
      });
      const refreshed = queryClient.getQueryData<GetAvailabilityCheck200>([
        'availability-check',
        check.id,
      ]);
      if (refreshed) pruneDraft(refreshed);
    },
    onSuccess: async (updated) => {
      clear();
      await queryClient.invalidateQueries({
        queryKey: ['availability-checks'],
      });
      await onAnswered();
      // After navigation, so this page never flips to "Confirmada" mid-submit.
      queryClient.setQueryData(['availability-check', check.id], updated);
    },
  });
  const locale = getLocale();
  const confirmationDate = check.confirmedAt
    ? formatDayOf({ value: check.confirmedAt, timeZone: churchTimezone })
    : null;
  const label = confirmed
    ? m.availability_detail_save_changes()
    : m.availability_detail_confirm();
  const currentInstant = now();
  const churchDay = today({
    instant: currentInstant,
    timeZone: churchTimezone,
  });
  const daysLeft = check.answerBy
    ? calendarDaysBetween({
        start: churchDay,
        end: parseCalendarDay({ value: check.answerBy }),
      })
    : null;
  const overdue = daysLeft !== null && daysLeft < 0;
  const isAvailable = (shift: GetAvailabilityCheck200ShiftsItem) =>
    shift.published
      ? shift.available
      : !draft.markedShiftIds.has(shift.shiftId);
  // Published Shifts are not the volunteer's to answer, so the count leaves them out.
  const unavailableCount = editableShifts.filter(
    (shift) => !isAvailable(shift),
  ).length;
  const totalCount = editableShifts.length;
  const answerSummary =
    unavailableCount === 0
      ? m.availability_detail_available_everywhere()
      : (totalCount === 1
          ? m.availability_detail_open_count_one
          : m.availability_detail_open_count)({
          unavailable: unavailableCount,
          total: totalCount,
        });
  // Every Shift published: nothing is left to answer, so the page only points to the schedule.
  const allPublished = editableShifts.length === 0;
  const canEdit = !check.readOnly && !allPublished;
  const hasMarks = unavailableCount > 0;
  const showUndo = undoDraft !== null && !answer.isPending;
  const editDraft: typeof setDraft = (next) => {
    setUndoDraft(null);
    setDraft(next);
  };
  const done = confirmed && !hasUnsentChanges && !answer.isPending;
  const unsaved = confirmed && hasUnsentChanges;
  const countdownUrgent = daysLeft !== null && daysLeft <= 1;
  // The deadline chip carries the date, so the description stays one instruction.
  const description = check.readOnly
    ? m.availability_detail_read_only()
    : allPublished
      ? m.availability_detail_help_locked()
      : [
          m.availability_detail_help_covers(),
          overdue ? m.availability_detail_overdue_hint() : null,
        ]
          .filter(Boolean)
          .join(' ');
  // Shifts arrive in the backend's start-time order; grouping keeps it.
  const days = new Map<CalendarDay, GetAvailabilityCheck200ShiftsItem[]>();
  for (const shift of check.shifts) {
    const day = getShiftDate({ shift, timeZone: churchTimezone });
    const shifts = days.get(day) ?? [];
    shifts.push(shift);
    days.set(day, shifts);
  }
  const dayEntries = [...days];
  const isPastDay = ([, shifts]: DayEntry) =>
    shifts.every(
      (shift) =>
        compareInstants({
          left: parseInstant({ value: shift.endTime }),
          right: currentInstant,
        }) <= 0,
    );
  const isPublishedDay = ([, shifts]: DayEntry) =>
    shifts.every((shift) => shift.published);
  const pastDays = dayEntries.filter(isPastDay);
  const upcomingDays = dayEntries.filter((entry) => !isPastDay(entry));
  const openDays = upcomingDays.filter((entry) => !isPublishedDay(entry));
  // Days left to answer come first; settled days fold away while any are open.
  const publishedDays =
    openDays.length > 0 ? upcomingDays.filter(isPublishedDay) : [];
  const shownDays = publishedDays.length > 0 ? openDays : upcomingDays;
  const markedDays = dayEntries
    .filter(([, shifts]) =>
      shifts.some(
        (shift) => !shift.published && draft.markedShiftIds.has(shift.shiftId),
      ),
    )
    .map(([day]) => day);
  const dayId = (day: CalendarDay) => `${idPrefix}-day-${day}`;
  const markedDaysId = `${idPrefix}-marked-days`;
  const jumpToDay = (day: CalendarDay) => {
    const section = document.getElementById(dayId(day));
    if (!section) return;
    const folded = section.closest('details');
    if (folded) folded.open = true;
    const reduceMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    section.scrollIntoView?.({
      block: 'start',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    section.querySelector('h2')?.focus({ preventScroll: true });
  };
  const scheduleLink = (
    <Link to="/my-schedule" className={LINK_CLASS}>
      {m.availability_detail_published_link()}
    </Link>
  );
  const publishedNotice = (
    <p
      className={cn(
        'flex flex-wrap items-center gap-x-1.5',
        touch ? 'text-sm' : 'text-xs',
        SECONDARY_TONE,
      )}
    >
      <Lock aria-hidden className="size-3.5 shrink-0" />
      {m.availability_detail_published_day()}
      <span aria-hidden>·</span> {scheduleLink}
    </p>
  );

  const renderDay = ([day, shifts]: DayEntry) => {
    const dayLabel = formatCalendarDayWithWeekday({ day, locale });
    const dayShifts = shifts.filter((shift) => !shift.published);
    const hasPublished = dayShifts.length < shifts.length;
    const fullyPublished = dayShifts.length === 0;
    const wholeDayUnavailable =
      dayShifts.length > 0 &&
      dayShifts.every((shift) => draft.markedShiftIds.has(shift.shiftId));
    return (
      <section
        key={day}
        id={dayId(day)}
        aria-label={dayLabel}
        className={cn('min-w-0 scroll-mt-24', !touch && 'max-w-xl')}
      >
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b',
            // Desktop: one header height with or without the whole-day button, so columns line up.
            touch ? 'pb-2' : 'min-h-7 pb-1',
          )}
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2
              tabIndex={-1}
              className={cn('font-semibold', touch ? 'text-base' : 'text-sm')}
            >
              {dayLabel}
            </h2>
            {fullyPublished ? (
              // The schedule outcome, not an availability count; the header says it once when every day is published.
              allPublished ? null : (
                publishedNotice
              )
            ) : dayShifts.length < 2 ? null : wholeDayUnavailable &&
              !hasPublished ? (
              <p
                className={cn(
                  'flex items-center gap-1.5',
                  touch ? 'text-sm' : 'text-xs',
                )}
              >
                <CircleX
                  aria-hidden
                  className="size-3.5 shrink-0 text-destructive"
                />
                <span className={SECONDARY_TONE}>
                  {m.availability_detail_whole_day()}
                </span>
              </p>
            ) : (
              <p
                className={cn(
                  'tabular-nums',
                  touch ? 'text-sm' : 'text-xs',
                  SECONDARY_TONE,
                )}
              >
                {m.availability_detail_day_count({
                  available: dayShifts.filter(isAvailable).length,
                  total: dayShifts.length,
                })}
              </p>
            )}
          </div>
          {!check.readOnly && dayShifts.length > 1 ? (
            <Button
              variant="outline"
              size={touch ? undefined : 'xs'}
              aria-label={
                wholeDayUnavailable
                  ? m.availability_detail_day_all_available({ day: dayLabel })
                  : m.availability_detail_day_all_unavailable({
                      day: dayLabel,
                    })
              }
              disabled={answer.isPending}
              className={cn(touch && 'h-auto min-h-11 whitespace-normal')}
              onClick={() => {
                editDraft((current) => {
                  let next = current;
                  for (const shift of dayShifts) {
                    // Flip only the rows not already on the target side.
                    if (
                      next.markedShiftIds.has(shift.shiftId) ===
                      wholeDayUnavailable
                    ) {
                      next = toggleShiftUnavailable({
                        draft: next,
                        shifts: editableShifts,
                        shiftId: shift.shiftId,
                        timeZone: churchTimezone,
                      });
                    }
                  }
                  return next;
                });
              }}
            >
              {touch
                ? wholeDayUnavailable
                  ? m.availability_detail_mark_day_available()
                  : m.availability_detail_mark_day_unavailable()
                : wholeDayUnavailable
                  ? m.availability_detail_mark_day_available_short()
                  : m.availability_detail_mark_day_unavailable_short()}
            </Button>
          ) : null}
        </div>
        {hasPublished && !fullyPublished ? (
          <div className="pt-1.5 pb-1">{publishedNotice}</div>
        ) : null}
        <ul className="divide-y">
          {shifts.map((shift) => {
            const switchId = `${idPrefix}-shift-${shift.shiftId}`;
            const noteId = `${switchId}-note`;
            const available = isAvailable(shift);
            return (
              <li
                key={shift.shiftId}
                className={cn(
                  'flex items-center justify-between gap-3',
                  touch && 'py-2.5',
                )}
              >
                {/* Desktop reads one line: title · time · note, the answer flush right. */}
                <div
                  className={cn(
                    'min-w-0',
                    touch
                      ? 'space-y-0.5'
                      : 'flex items-baseline gap-2 whitespace-nowrap',
                  )}
                >
                  <h3
                    className={cn(
                      'font-medium',
                      touch ? 'break-words text-base' : 'truncate text-sm',
                    )}
                  >
                    {shift.eventTitle}
                  </h3>
                  <p
                    className={cn(
                      touch ? 'text-sm' : 'truncate text-xs',
                      SECONDARY_TONE,
                    )}
                  >
                    <span className="tabular-nums">
                      {formatShiftTimes({ shift, timeZone: churchTimezone })}
                    </span>
                    {shift.label ? (
                      <>
                        <span aria-hidden> · </span>
                        <span id={noteId}>{shift.label}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                {shift.published ? (
                  <Badge
                    variant="secondary"
                    className={cn(
                      'shrink-0',
                      touch && 'h-7 px-2.5 text-sm',
                      shift.assigned
                        ? 'bg-green-600/10 text-green-700 dark:text-green-400'
                        : SECONDARY_TONE,
                    )}
                  >
                    <Lock aria-hidden />
                    {shift.assigned
                      ? m.availability_detail_locked_assigned()
                      : m.availability_detail_locked_unassigned()}
                  </Badge>
                ) : (
                  <label
                    htmlFor={switchId}
                    className={cn(
                      'flex shrink-0 cursor-pointer items-center',
                      touch
                        ? 'min-h-11 gap-3 text-sm'
                        : 'min-h-7 gap-2 text-xs',
                    )}
                  >
                    {/* Desktop names only the exception; the switch carries "available". */}
                    {available ? (
                      touch ? (
                        <span aria-hidden className={SECONDARY_TONE}>
                          {m.availability_detail_available()}
                        </span>
                      ) : null
                    ) : (
                      <span
                        aria-hidden
                        className="flex items-center gap-1.5 font-medium"
                      >
                        <CircleX className="size-4 shrink-0 text-destructive" />
                        {m.availability_detail_unavailable()}
                      </span>
                    )}
                    <Switch
                      aria-label={m.availability_detail_switch_name({
                        shift: shift.eventTitle,
                        time: formatInstantRangeOf({
                          start: shift.startTime,
                          end: shift.endTime,
                          timeZone: churchTimezone,
                        }),
                      })}
                      aria-describedby={shift.label ? noteId : undefined}
                      id={switchId}
                      disabled={check.readOnly || answer.isPending}
                      checked={available}
                      onCheckedChange={() =>
                        editDraft((current) =>
                          toggleShiftUnavailable({
                            draft: current,
                            shifts: editableShifts,
                            shiftId: shift.shiftId,
                            timeZone: churchTimezone,
                          }),
                        )
                      }
                    />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  const dayGrid = (entries: DayEntry[]) => (
    // Desktop days fill row by row, so the month reads left to right, then down.
    <div
      className={
        touch
          ? 'space-y-7'
          : 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] items-start gap-x-10 gap-y-4'
      }
    >
      {entries.map(renderDay)}
    </div>
  );

  const fold = ({ summary, entries, note }: DayFold) => (
    <details className="group">
      <summary
        className={cn(
          'radius-control flex cursor-pointer list-none items-center gap-1.5 hover:text-foreground [&::-webkit-details-marker]:hidden',
          touch ? 'min-h-11 text-sm' : 'min-h-8 text-xs',
          SECONDARY_TONE,
        )}
      >
        <ChevronRight
          aria-hidden
          className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        {summary}
      </summary>
      <div className="space-y-3 pt-3">
        {note}
        {dayGrid(entries)}
      </div>
    </details>
  );

  // One reset beside the main button: the saved answer's discard while editing it, else the shortcut.
  const secondaryAction = !canEdit ? null : unsaved ? (
    restored ? null : (
      <Button
        variant="outline"
        className="shrink-0"
        disabled={answer.isPending}
        onClick={() => {
          setUndoDraft(null);
          discard();
        }}
      >
        {m.availability_detail_discard_changes()}
      </Button>
    )
  ) : showUndo ? (
    <Button
      variant="outline"
      className="shrink-0"
      onClick={() => {
        setDraft(undoDraft);
        setUndoDraft(null);
      }}
    >
      {m.availability_detail_undo()}
    </Button>
  ) : !hasMarks || done ? null : (
    // A draft reset, never a submit: the main button still sends the answer.
    <Button
      variant="outline"
      className="shrink-0"
      disabled={answer.isPending}
      onClick={() => {
        setUndoDraft(draft);
        setDraft(NO_MARKS);
      }}
    >
      {m.availability_detail_confirm_all()}
    </Button>
  );

  const markedDayNames = markedDays
    .map((day) => formatDayLabel({ day, locale }))
    .join(', ');

  return (
    <FormControlSizeProvider size={touch ? 'touch' : 'default'}>
      {/* Room for the fixed mobile bar, which keeps one height from the first render. */}
      <WorkspacePage className={cn(canEdit && 'pb-36 md:pb-0')}>
        <Link
          to="/availability"
          className="-my-2 inline-flex min-h-11 items-center gap-1 self-start font-medium text-primary text-sm md:hidden"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {m.availability_detail_back()}
        </Link>
        <WorkspaceIntroPanel
          title={`${check.ministryName} · ${check.cycleName}`}
          description={description}
          autoFocusTitle
          aside={
            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              {allPublished && !check.readOnly ? (
                <HeaderStatChip
                  testId="availability-published-chip"
                  label={m.availability_detail_published_day()}
                  value={scheduleLink}
                />
              ) : (
                <>
                  {/* Mobile: the values speak for themselves, so both chips share one line. */}
                  <HeaderStatChip
                    testId="availability-answer-chip"
                    label={m.availability_detail_summary()}
                    labelClassName="max-md:sr-only"
                    value={
                      confirmed ? (
                        <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                          <CircleCheck aria-hidden className="size-3.5" />
                          {check.confirmedAt && confirmationDate ? (
                            <time dateTime={check.confirmedAt}>
                              {m.availability_detail_confirmed_on({
                                date: confirmationDate,
                              })}
                            </time>
                          ) : (
                            m.availability_detail_confirmed()
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-yellow-700 dark:text-yellow-300">
                          <Clock aria-hidden className="size-3.5" />
                          {m.availability_detail_unconfirmed()}
                        </span>
                      )
                    }
                  />
                  <HeaderStatChip
                    testId="availability-deadline-chip"
                    label={m.answers_deadline()}
                    labelClassName="max-md:sr-only"
                    value={
                      <>
                        {check.answerBy ? (
                          <time
                            dateTime={check.answerBy}
                            className="tabular-nums"
                          >
                            {formatCalendarDateOnly({ value: check.answerBy })}
                          </time>
                        ) : (
                          m.answers_no_deadline()
                        )}
                        {overdue ? (
                          <>
                            <span aria-hidden> · </span>
                            <span className="text-destructive">
                              {m.answers_overdue()}
                            </span>
                          </>
                        ) : daysLeft !== null && !check.readOnly ? (
                          <>
                            <span aria-hidden> · </span>
                            <span
                              className={
                                countdownUrgent
                                  ? 'text-amber-700 dark:text-amber-300'
                                  : SECONDARY_TONE
                              }
                            >
                              {formatDeadlineCountdown({ daysLeft })}
                            </span>
                          </>
                        ) : null}
                      </>
                    }
                  />
                </>
              )}
            </div>
          }
        />
        {restored ? (
          <div
            role="status"
            className="surface-subtle flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm"
          >
            <p>{m.availability_draft_restored()}</p>
            <Button
              disabled={answer.isPending}
              variant="outline"
              onClick={discard}
            >
              {m.availability_draft_discard()}
            </Button>
          </div>
        ) : null}
        <div className="surface-panel">
          <div
            className={cn(
              'workspace-panel-lg',
              touch ? 'space-y-6' : 'space-y-4',
            )}
          >
            {pastDays.length > 0
              ? fold({
                  summary:
                    pastDays.length === 1
                      ? m.availability_detail_past_days_one()
                      : m.availability_detail_past_days({
                          count: pastDays.length,
                        }),
                  entries: pastDays,
                })
              : null}
            {dayGrid(shownDays)}
            {publishedDays.length > 0
              ? fold({
                  summary:
                    publishedDays.length === 1
                      ? m.availability_detail_published_days_one()
                      : m.availability_detail_published_days({
                          count: publishedDays.length,
                        }),
                  entries: publishedDays,
                  note: (
                    <p
                      className={cn(
                        'flex items-center gap-1.5',
                        touch ? 'text-sm' : 'text-xs',
                        SECONDARY_TONE,
                      )}
                    >
                      <Lock aria-hidden className="size-3.5 shrink-0" />
                      {m.availability_detail_help_locked()}
                    </p>
                  ),
                })
              : null}
          </div>
          {canEdit ? (
            // Mobile: fixed to the viewport. Desktop: the panel's flush sticky footer.
            // Same rows in every state, so the first change never grows the bar over a row.
            <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:sticky md:bottom-[calc(-1*var(--workspace-pad-y))] md:z-10 md:rounded-b-[inherit] md:px-(--workspace-panel-pad-lg) md:py-2">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-6">
                <div
                  className={cn(
                    'flex min-w-0 flex-col justify-center',
                    touch ? 'min-h-11' : 'min-h-8',
                  )}
                >
                  {hasMarks ? (
                    <button
                      type="button"
                      aria-describedby={markedDaysId}
                      className="radius-control self-start text-left font-medium text-sm underline decoration-foreground/40 underline-offset-3 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => jumpToDay(markedDays[0])}
                    >
                      {answerSummary}
                    </button>
                  ) : (
                    <p className="font-medium text-sm">{answerSummary}</p>
                  )}
                  {unsaved || hasMarks ? (
                    <p className="truncate text-xs">
                      {unsaved ? (
                        <span
                          role="status"
                          className="font-medium text-amber-700 dark:text-amber-300"
                        >
                          {m.availability_detail_unsaved()}
                        </span>
                      ) : null}
                      {unsaved && hasMarks ? (
                        <span aria-hidden> · </span>
                      ) : null}
                      {hasMarks ? (
                        <span id={markedDaysId} className={SECONDARY_TONE}>
                          {markedDayNames}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <div
                  className={cn(
                    'flex items-center gap-2 md:shrink-0',
                    touch && 'min-h-11',
                  )}
                >
                  {secondaryAction}
                  {done ? (
                    <p className="flex items-center gap-1.5 font-medium text-green-700 text-sm dark:text-green-400">
                      <CircleCheck aria-hidden className="size-4 shrink-0" />
                      <span>{m.availability_detail_done()}</span>
                    </p>
                  ) : (
                    <Button
                      className={cn(
                        touch && 'h-auto min-h-11 flex-1 whitespace-normal',
                      )}
                      disabled={answer.isPending}
                      onClick={() => answer.mutate()}
                    >
                      {answer.isPending ? <Spinner /> : null}
                      {answer.isPending
                        ? confirmed
                          ? m.availability_detail_saving()
                          : m.availability_detail_pending()
                        : label}
                    </Button>
                  )}
                </div>
              </div>
              {showUndo ? (
                <p role="status" className="sr-only">
                  {m.availability_detail_all_marked_available()}
                </p>
              ) : null}
              {answer.isError ? (
                <p role="alert" className="pt-1 text-destructive text-sm">
                  {publishedRefusal
                    ? m.availability_detail_published_retry()
                    : m.availability_detail_send_error()}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <AlertDialog
          open={blocker.status === 'blocked'}
          onOpenChange={(open) => {
            if (!open) blocker.reset?.();
          }}
        >
          <AlertDialogContent className="data-[size=default]:max-w-sm data-[size=default]:sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">
                {m.availability_leave_title()}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                {confirmed
                  ? m.availability_leave_body_changes()
                  : m.availability_leave_body()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {m.availability_leave_stay()}
              </AlertDialogCancel>
              <Button
                variant="outline"
                size="touch"
                onClick={() => blocker.proceed?.()}
              >
                {m.availability_leave_exit()}
              </Button>
              <AlertDialogAction
                disabled={answer.isPending}
                onClick={() => {
                  // Sending ends on the list, like the main button.
                  blocker.reset?.();
                  answer.mutate();
                }}
              >
                {label}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </WorkspacePage>
    </FormControlSizeProvider>
  );
}

function AvailabilityDetailContent({
  checkId,
  onAnswered,
}: AvailabilityDetailPageProps) {
  const scope = useCallerCapabilitiesScope();
  const touch = useMediaQuery('(max-width: 767px)');
  const query = useQuery({
    queryKey: ['availability-check', checkId],
    queryFn: () => volunteerApi.getAvailabilityCheck(checkId),
  });
  if (query.isLoading)
    return (
      <Pending label={m.availability_detail_loading()}>
        <Skeleton className="h-64 w-full" />
      </Pending>
    );
  if (query.isError) {
    const status = isAxiosError(query.error)
      ? query.error.response?.status
      : undefined;
    if (status === 404 || status === 403)
      return (
        <div className="space-y-2">
          {status === 404 ? (
            <p role="alert">{m.error_not_found()}</p>
          ) : (
            <p role="status">{m.shell_not_serving()}</p>
          )}
          <Link
            to="/availability"
            className={cn(
              'inline-flex min-h-11 items-center gap-1 md:min-h-8',
              LINK_CLASS,
            )}
          >
            <ChevronLeft aria-hidden className="size-4" />
            {m.availability_detail_back()}
          </Link>
        </div>
      );
    return (
      <div role="alert" className="space-y-3 text-destructive">
        <p>{m.availability_detail_load_error()}</p>
        <Button variant="outline" size="touch" onClick={() => query.refetch()}>
          {m.schedules_retry()}
        </Button>
      </div>
    );
  }
  if (!query.data || !scope?.userId) return null;
  return (
    <AvailabilityAnswer
      key={`${scope.userId}:${checkId}`}
      userId={scope.userId}
      check={query.data}
      touch={touch}
      hasFreshDetail={query.isFetchedAfterMount}
      onAnswered={onAnswered}
    />
  );
}

export function AvailabilityDetailPage(props: AvailabilityDetailPageProps) {
  return (
    <CapabilityGate
      allow={({ hasVolunteerMembership }) => hasVolunteerMembership}
      refusal="not-serving"
    >
      <AvailabilityDetailContent {...props} />
    </CapabilityGate>
  );
}
