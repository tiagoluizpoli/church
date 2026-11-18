import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  type CalendarDay,
  calendarDaysBetween,
  compareInstants,
  formatCalendarDayWithWeekday,
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
  TriangleAlert,
} from 'lucide-react';
import { useId, useState } from 'react';
import { z } from 'zod';
import { useLocalAvailabilityDraft } from '../hooks/use-local-availability-draft';
import {
  buildUnavailableShiftsBody,
  createInitialUnavailableShiftDraft,
  getShiftDate,
  toggleShiftUnavailable,
  type UnavailableShiftDraft,
} from '../lib/unavailable-shifts';
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
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
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
  hasFreshDetail: boolean;
  userId: string;
  onAnswered: () => void | Promise<void>;
}

function AvailabilityAnswer({
  check,
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
  const canEdit = !check.readOnly && editableShifts.length > 0;
  const hasMarks = unavailableCount > 0;
  const showUndo = undoDraft !== null && !answer.isPending;
  const editDraft: typeof setDraft = (next) => {
    setUndoDraft(null);
    setDraft(next);
  };
  const done = confirmed && !hasUnsentChanges && !answer.isPending;
  const countdownUrgent = daysLeft !== null && daysLeft <= 1;
  const changeUntil =
    check.answerBy && !overdue
      ? m.availability_detail_change_until({
          date: formatCalendarDateOnly({ value: check.answerBy }),
        })
      : null;
  const help = [
    confirmed ? null : m.availability_detail_help_covers(),
    changeUntil,
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
  const pastDays = dayEntries.filter(isPastDay);
  const upcomingDays = dayEntries.filter((entry) => !isPastDay(entry));
  // With something left to answer, fully published days fold away so a switch leads the page.
  const isLockedDay = ([, shifts]: DayEntry) =>
    editableShifts.length > 0 && shifts.every((shift) => shift.published);
  const lockedDays = upcomingDays.filter(isLockedDay);
  const openDays = upcomingDays.filter((entry) => !isLockedDay(entry));
  const lockedShiftCount = lockedDays.reduce(
    (count, [, shifts]) => count + shifts.length,
    0,
  );
  const markedDays = dayEntries
    .filter(([, shifts]) =>
      shifts.some(
        (shift) => !shift.published && draft.markedShiftIds.has(shift.shiftId),
      ),
    )
    .map(([day]) => day);
  const dayId = (day: CalendarDay) => `${idPrefix}-day-${day}`;
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
  const foldSummaryClass = cn(
    'radius-control flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm hover:text-foreground [&::-webkit-details-marker]:hidden',
    SECONDARY_TONE,
  );

  const renderDay = ([day, shifts]: DayEntry, showLockNotice = true) => {
    const dayLabel = formatCalendarDayWithWeekday({ day, locale });
    const dayShifts = shifts.filter((shift) => !shift.published);
    const hasPublished = dayShifts.length < shifts.length;
    const wholeDayUnavailable =
      dayShifts.length > 0 &&
      dayShifts.every((shift) => draft.markedShiftIds.has(shift.shiftId));
    return (
      <section
        key={day}
        id={dayId(day)}
        aria-label={dayLabel}
        className="scroll-mt-24 space-y-3"
      >
        <div className="space-y-3 border-b pb-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="space-y-0.5">
              <h2 tabIndex={-1} className="font-semibold text-base">
                {dayLabel}
              </h2>
              {wholeDayUnavailable && !hasPublished ? (
                <p className="flex items-center gap-1.5 text-sm">
                  <CircleX
                    aria-hidden
                    className="size-4 shrink-0 text-destructive"
                  />
                  <span className={SECONDARY_TONE}>
                    {m.availability_detail_whole_day()}
                  </span>
                </p>
              ) : (
                <p className={cn('text-sm tabular-nums', SECONDARY_TONE)}>
                  {(shifts.length === 1
                    ? m.availability_detail_day_count_one
                    : m.availability_detail_day_count)({
                    available: shifts.filter(isAvailable).length,
                    total: shifts.length,
                  })}
                </p>
              )}
            </div>
            {!check.readOnly && dayShifts.length > 1 ? (
              <Button
                variant="outline"
                size="touch"
                aria-label={
                  wholeDayUnavailable
                    ? m.availability_detail_day_all_available({ day: dayLabel })
                    : m.availability_detail_day_all_unavailable({
                        day: dayLabel,
                      })
                }
                disabled={answer.isPending}
                className="h-auto min-h-11 whitespace-normal"
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
                {wholeDayUnavailable
                  ? m.availability_detail_mark_day_available()
                  : m.availability_detail_mark_day_unavailable()}
              </Button>
            ) : null}
          </div>
          {hasPublished && showLockNotice ? (
            // Each locked chip already says "Publicado"; the day only points to the schedule.
            <p
              className={cn('flex items-center gap-2 text-sm', SECONDARY_TONE)}
            >
              <Lock aria-hidden className="size-4 shrink-0" />
              <Link to="/my-schedule" className={LINK_CLASS}>
                {m.availability_detail_published_link()}
              </Link>
            </p>
          ) : null}
        </div>
        <ul className="divide-y">
          {shifts.map((shift) => {
            const switchId = `${idPrefix}-shift-${shift.shiftId}`;
            const noteId = `${switchId}-note`;
            const available = isAvailable(shift);
            return (
              <li
                key={shift.shiftId}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <h3 className="break-words font-medium text-base">
                    {shift.eventTitle}
                  </h3>
                  <p className={cn('text-sm', SECONDARY_TONE)}>
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
                  <span
                    className={cn(
                      'radius-control inline-flex min-h-8 items-center gap-1.5 px-2.5 py-1 text-sm',
                      shift.assigned
                        ? 'bg-green-600/10 text-green-700 dark:text-green-400'
                        : cn('bg-muted', SECONDARY_TONE),
                    )}
                  >
                    <Lock aria-hidden className="size-3.5 shrink-0" />
                    {shift.assigned
                      ? m.availability_detail_locked_assigned()
                      : m.availability_detail_locked_unassigned()}
                  </span>
                ) : (
                  <label
                    htmlFor={switchId}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                  >
                    {available ? (
                      <span aria-hidden>
                        {m.availability_detail_available()}
                      </span>
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

  return (
    // Below lg the two wrappers are `contents`, so `order` interleaves header, status and days.
    <div
      className={cn(
        'mx-auto flex w-full max-w-2xl flex-col gap-6 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,40rem)_20rem] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,40rem)_22rem]',
        // Room for the fixed mobile bar, which only exists while something is left to send.
        !check.readOnly && !done && (confirmed ? 'pb-64' : 'pb-40'),
        'md:pb-0',
      )}
    >
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
        <header className="order-1 space-y-1 lg:order-none">
          <Link
            to="/availability"
            className="-ml-1 inline-flex min-h-11 items-center gap-1 font-medium text-primary text-sm md:hidden"
          >
            <ChevronLeft aria-hidden className="size-4" />
            {m.availability_detail_back()}
          </Link>
          <h1 className="font-semibold text-xl">{check.ministryName}</h1>
          <p className={SECONDARY_TONE}>{check.cycleName}</p>
          {!check.readOnly && help ? (
            <p className={cn('max-w-prose pt-1 text-sm', SECONDARY_TONE)}>
              {help}
            </p>
          ) : null}
        </header>
        <div className="order-3 space-y-8 lg:order-none">
          {restored ? (
            <div
              role="status"
              className="surface-subtle flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
            >
              <p>{m.availability_draft_restored()}</p>
              <Button
                variant="outline"
                size="touch"
                disabled={answer.isPending}
                onClick={discard}
              >
                {m.availability_draft_discard()}
              </Button>
            </div>
          ) : null}
          {pastDays.length > 0 || lockedDays.length > 0 ? (
            <div className="space-y-1">
              {pastDays.length > 0 ? (
                <details className="group">
                  <summary className={foldSummaryClass}>
                    <ChevronRight
                      aria-hidden
                      className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                    />
                    {pastDays.length === 1
                      ? m.availability_detail_past_days_one()
                      : m.availability_detail_past_days({
                          count: pastDays.length,
                        })}
                  </summary>
                  <div className="space-y-8 pt-4">
                    {pastDays.map((entry) => renderDay(entry))}
                  </div>
                </details>
              ) : null}
              {lockedDays.length > 0 ? (
                <details className="group">
                  <summary className={foldSummaryClass}>
                    <ChevronRight
                      aria-hidden
                      className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                    />
                    <Lock aria-hidden className="size-4" />
                    {lockedShiftCount === 1
                      ? m.availability_detail_published_days_one()
                      : m.availability_detail_published_days({
                          count: lockedShiftCount,
                        })}
                  </summary>
                  <div className="space-y-8 pt-4">
                    <p className={cn('text-sm', SECONDARY_TONE)}>
                      {m.availability_detail_published_group()}{' '}
                      <Link to="/my-schedule" className={LINK_CLASS}>
                        {m.availability_detail_published_link()}
                      </Link>
                    </p>
                    {lockedDays.map((entry) => renderDay(entry, false))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
          {openDays.map((entry) => renderDay(entry))}
        </div>
      </div>
      <div className="surface-panel contents lg:sticky lg:top-5 lg:flex lg:flex-col lg:gap-5 lg:p-5">
        <div className="order-2 space-y-3 lg:order-none">
          <h2 className="sr-only lg:not-sr-only lg:font-semibold lg:text-base">
            {m.availability_detail_summary()}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm lg:flex-col lg:items-start">
            {confirmed ? (
              <p className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
                <CircleCheck aria-hidden className="size-4" />
                {check.confirmedAt && confirmationDate ? (
                  <time dateTime={check.confirmedAt}>
                    {m.availability_detail_confirmed_on({
                      date: confirmationDate,
                    })}
                  </time>
                ) : (
                  m.availability_detail_confirmed()
                )}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 font-medium text-yellow-700 dark:text-yellow-300">
                <Clock aria-hidden className="size-4" />
                {m.availability_detail_unconfirmed()}
              </p>
            )}
            <p>
              {m.answers_deadline()}:{' '}
              {check.answerBy ? (
                <time dateTime={check.answerBy} className="tabular-nums">
                  {formatCalendarDateOnly({ value: check.answerBy })}
                </time>
              ) : (
                m.answers_no_deadline()
              )}
              {daysLeft !== null && !overdue && !check.readOnly ? (
                <span
                  className={
                    countdownUrgent
                      ? 'font-medium text-amber-700 dark:text-amber-300'
                      : SECONDARY_TONE
                  }
                >
                  {' · '}
                  {formatDeadlineCountdown({ daysLeft })}
                </span>
              ) : null}
            </p>
          </div>
          {done ? (
            <p className="flex items-center gap-2 font-medium text-green-700 text-sm dark:text-green-400">
              <CircleCheck aria-hidden className="size-5 shrink-0" />
              {m.availability_detail_done()}
            </p>
          ) : null}
          {overdue ? (
            <div className="radius-control flex gap-2.5 border border-destructive/30 bg-destructive/8 p-3 text-sm">
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-destructive"
              />
              <div className="space-y-0.5">
                <p className="font-medium text-destructive">
                  {m.answers_overdue()}
                </p>
                {!check.readOnly ? (
                  <p>{m.availability_detail_overdue_hint()}</p>
                ) : null}
              </div>
            </div>
          ) : null}
          {check.readOnly ? (
            <div className="radius-control flex gap-2.5 bg-muted p-3 text-sm">
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
              <p>{m.availability_detail_read_only()}</p>
            </div>
          ) : null}
        </div>
        {!check.readOnly ? (
          <div
            className={cn(
              'space-y-2 lg:static lg:space-y-3 lg:border-t lg:bg-transparent lg:pt-5 lg:pb-0',
              // A sent answer needs no bar; it comes back with the first unsent change.
              done
                ? 'order-2 lg:order-none'
                : 'fixed inset-x-0 bottom-0 z-30 order-4 border-t bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:sticky md:inset-x-auto md:z-10 md:bg-background md:px-0',
            )}
          >
            {confirmed && hasUnsentChanges ? (
              <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-start">
                <p
                  role="status"
                  className="min-w-0 flex-1 font-medium text-amber-700 text-sm dark:text-amber-300"
                >
                  {m.availability_detail_unsaved()}
                </p>
                {restored ? null : (
                  <Button
                    variant="outline"
                    size="touch"
                    className="shrink-0"
                    disabled={answer.isPending}
                    onClick={() => {
                      setUndoDraft(null);
                      discard();
                    }}
                  >
                    {m.availability_detail_discard_changes()}
                  </Button>
                )}
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-stretch">
              <div className="min-w-0 space-y-1">
                {hasMarks ? (
                  <button
                    type="button"
                    className="radius-control min-h-11 min-w-0 text-left font-medium text-sm underline decoration-foreground/40 underline-offset-3 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => jumpToDay(markedDays[0])}
                  >
                    {answerSummary}
                  </button>
                ) : (
                  <p className="flex min-h-11 min-w-0 items-center font-medium text-sm">
                    {answerSummary}
                  </p>
                )}
                {markedDays.length > 0 ? (
                  <ul
                    aria-label={m.availability_detail_marked_days()}
                    className="hidden space-y-1 text-sm lg:block"
                  >
                    {markedDays.map((day) => (
                      <li key={day}>
                        <button
                          type="button"
                          className={cn(
                            'radius-control flex min-h-8 items-center gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-ring',
                            LINK_CLASS,
                          )}
                          onClick={() => jumpToDay(day)}
                        >
                          <CircleX
                            aria-hidden
                            className="size-4 shrink-0 text-destructive"
                          />
                          {formatCalendarDayWithWeekday({ day, locale })}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {canEdit ? (
                showUndo ? (
                  <Button
                    variant="outline"
                    size="touch"
                    className="shrink-0"
                    onClick={() => {
                      setDraft(undoDraft);
                      setUndoDraft(null);
                    }}
                  >
                    {m.availability_detail_undo()}
                  </Button>
                ) : (
                  // A draft reset, never a submit: the main button still sends the answer.
                  <Button
                    variant="outline"
                    size="touch"
                    className="shrink-0"
                    disabled={!hasMarks || answer.isPending}
                    onClick={() => {
                      setUndoDraft(draft);
                      setDraft(NO_MARKS);
                    }}
                  >
                    {m.availability_detail_confirm_all()}
                  </Button>
                )
              ) : null}
            </div>
            {showUndo ? (
              <p role="status" className="sr-only">
                {m.availability_detail_all_marked_available()}
              </p>
            ) : null}
            {done ? null : (
              <Button
                size="touch"
                className="h-auto min-h-11 w-full whitespace-normal"
                disabled={answer.isPending}
                onClick={() => answer.mutate()}
              >
                {answer.isPending ? <Spinner /> : null}
                {answer.isPending
                  ? confirmed
                    ? m.availability_detail_saving()
                    : m.availability_detail_pending()
                  : answer.isError
                    ? confirmed
                      ? m.availability_detail_save_error()
                      : m.availability_detail_answer_error()
                    : label}
              </Button>
            )}
            {answer.isError ? (
              // One announcement: the button already reads the generic failure.
              <p
                role="alert"
                className={
                  publishedRefusal ? 'text-destructive text-sm' : 'sr-only'
                }
              >
                {publishedRefusal
                  ? m.availability_detail_published_retry()
                  : confirmed
                    ? m.availability_detail_save_error()
                    : m.availability_detail_answer_error()}
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
            <AlertDialogCancel>{m.availability_leave_stay()}</AlertDialogCancel>
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
              {m.availability_leave_send()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AvailabilityDetailContent({
  checkId,
  onAnswered,
}: AvailabilityDetailPageProps) {
  const scope = useCallerCapabilitiesScope();
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
    if (status === 404) return <p role="alert">{m.error_not_found()}</p>;
    if (status === 403) return <p role="status">{m.shell_not_serving()}</p>;
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
