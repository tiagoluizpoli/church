import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  type CalendarDay,
  formatCalendarDayWithWeekday,
  now,
  today,
} from '@church/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useId, useState } from 'react';
import { z } from 'zod';
import { useLocalAvailabilityDraft } from '../hooks/use-local-availability-draft';
import {
  buildUnavailableShiftsBody,
  createInitialUnavailableShiftDraft,
  getShiftDate,
  toggleShiftUnavailable,
} from '../lib/unavailable-shifts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type {
  GetAvailabilityCheck200,
  GetAvailabilityCheck200ShiftsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  formatCalendarDateOnly,
  formatDayOf,
  formatInstantRangeOf,
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
  const switchPrefix = useId();
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
  useBlocker({
    shouldBlockFn: () =>
      hasUnsentChanges &&
      !cleared.current &&
      !window.confirm(m.availability_draft_leave()),
    enableBeforeUnload: () => hasUnsentChanges && !cleared.current,
  });
  const queryClient = useQueryClient();
  const [publishedRefusal, setPublishedRefusal] = useState(false);
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
      queryClient.setQueryData(['availability-check', check.id], updated);
      await queryClient.invalidateQueries({
        queryKey: ['availability-checks'],
      });
      await onAnswered();
    },
  });
  const locale = getLocale();
  const confirmationDate = check.confirmedAt
    ? formatDayOf({ value: check.confirmedAt, timeZone: churchTimezone })
    : null;
  const confirmed = check.state === 'confirmed';
  const label = confirmed
    ? m.availability_detail_save_changes()
    : m.availability_detail_confirm();
  const currentInstant = now();
  const churchDay = today({
    instant: currentInstant,
    timeZone: churchTimezone,
  });
  const overdue = check.answerBy && check.answerBy < churchDay;
  const days = new Map<CalendarDay, GetAvailabilityCheck200ShiftsItem[]>();
  const sortedShifts = [...check.shifts].sort((left, right) =>
    left.startTime.localeCompare(right.startTime),
  );
  for (const shift of sortedShifts) {
    const day = getShiftDate({ shift, timeZone: churchTimezone });
    const shifts = days.get(day) ?? [];
    shifts.push(shift);
    days.set(day, shifts);
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-semibold text-xl">{check.ministryName}</h1>
        <p className="text-muted-foreground">{check.cycleName}</p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            {m.answers_deadline()}:{' '}
            {check.answerBy ? (
              <time dateTime={check.answerBy}>
                {formatCalendarDateOnly({ value: check.answerBy })}
              </time>
            ) : (
              m.answers_no_deadline()
            )}
          </span>
          {overdue ? (
            <span className="font-medium text-destructive">
              {m.answers_overdue()}
            </span>
          ) : null}
        </p>
        {confirmed ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{m.availability_detail_confirmed()}</Badge>
            {check.confirmedAt && confirmationDate ? (
              <time dateTime={check.confirmedAt}>
                {m.availability_detail_confirmed_on({
                  date: confirmationDate,
                })}
              </time>
            ) : null}
          </div>
        ) : (
          <Badge variant="outline">{m.availability_detail_unconfirmed()}</Badge>
        )}
        {check.readOnly ? <p>{m.availability_detail_read_only()}</p> : null}
        {confirmed && hasUnsentChanges ? (
          <p role="status" className="text-sm">
            {m.availability_detail_unsaved()}
          </p>
        ) : null}
      </header>
      {restored ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm"
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
      {[...days].map(([day, shifts]) => {
        const dayLabel = formatCalendarDayWithWeekday({
          day,
          locale,
        });
        return (
          <section key={day} aria-label={dayLabel} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <h2 className="font-semibold text-base">{dayLabel}</h2>
              <p className="text-muted-foreground text-sm">
                {m.availability_detail_day_count({
                  available: shifts.filter((shift) =>
                    shift.published
                      ? shift.available
                      : !draft.markedShiftIds.has(shift.shiftId),
                  ).length,
                  total: shifts.length,
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                {[true, false].map((available) => {
                  const dayShifts = shifts.filter((shift) => !shift.published);
                  const disabled =
                    check.readOnly ||
                    answer.isPending ||
                    dayShifts.length === 0 ||
                    dayShifts.every(
                      (shift) =>
                        !draft.markedShiftIds.has(shift.shiftId) === available,
                    );
                  return (
                    <Button
                      key={String(available)}
                      variant="outline"
                      size="touch"
                      disabled={disabled}
                      onClick={() => {
                        setDraft((current) => {
                          let next = current;
                          for (const shift of dayShifts) {
                            if (
                              !next.markedShiftIds.has(shift.shiftId) !==
                              available
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
                      {available
                        ? m.availability_detail_all_available()
                        : m.availability_detail_all_unavailable()}
                    </Button>
                  );
                })}
              </div>
            </div>
            <ul className="divide-y">
              {shifts.map((shift) => (
                <li
                  key={shift.shiftId}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <h3 className="break-words font-medium text-base">
                      {shift.eventTitle}
                    </h3>
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {formatInstantRangeOf({
                        start: shift.startTime,
                        end: shift.endTime,
                        timeZone: churchTimezone,
                      })}
                    </p>
                    {shift.published ? (
                      <p className="text-muted-foreground text-sm">
                        {m.availability_detail_published()}
                      </p>
                    ) : null}
                    {shift.label ? (
                      <p className="text-sm">{shift.label}</p>
                    ) : null}
                  </div>
                  <label
                    htmlFor={`${switchPrefix}-shift-${shift.shiftId}`}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                  >
                    {m.availability_detail_available()}
                    <Switch
                      aria-label={m.availability_detail_switch_name({
                        shift: shift.eventTitle,
                        time: formatInstantRangeOf({
                          start: shift.startTime,
                          end: shift.endTime,
                          timeZone: churchTimezone,
                        }),
                        label: shift.label ?? '',
                      })}
                      id={`${switchPrefix}-shift-${shift.shiftId}`}
                      disabled={
                        check.readOnly || answer.isPending || shift.published
                      }
                      checked={
                        shift.published
                          ? shift.available
                          : !draft.markedShiftIds.has(shift.shiftId)
                      }
                      onCheckedChange={() =>
                        setDraft((current) =>
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
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!check.readOnly ? (
        <div className="sticky bottom-20 z-10 border-t bg-background py-3 md:bottom-0">
          <Button
            size="touch"
            className="h-auto min-h-11 w-full whitespace-normal"
            disabled={answer.isPending}
            onClick={() => answer.mutate()}
          >
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
          {answer.isError ? (
            <p role="alert" className="pt-2 text-destructive text-sm">
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
    retry: false,
  });
  if (query.isLoading)
    return (
      <div role="status" aria-label={m.availability_detail_loading()}>
        <Skeleton className="h-64 w-full" />
      </div>
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
