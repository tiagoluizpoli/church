import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  type CalendarDay,
  formatCalendarDayWithWeekday,
  now,
  today,
} from '@church/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useId, useState } from 'react';
import {
  buildUnavailableShiftsBody,
  createInitialUnavailableShiftDraft,
  getShiftDate,
  toggleShiftUnavailable,
  toggleWholeDayUnavailable,
} from '../lib/unavailable-shifts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type {
  GetAvailabilityCheck200,
  GetAvailabilityCheck200ShiftsItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  formatCalendarDateOnly,
  formatInstantRangeOf,
} from '@/shared/utils/church-time';
import { volunteerApi } from '@/utils/api-instances';

export interface AvailabilityDetailPageProps {
  checkId: string;
  onAnswered: () => void | Promise<void>;
}

interface AvailabilityAnswerProps {
  check: GetAvailabilityCheck200;
  onAnswered: () => void | Promise<void>;
}

function AvailabilityAnswer({ check, onAnswered }: AvailabilityAnswerProps) {
  const { churchTimezone } = useTimezone();
  const switchPrefix = useId();
  const [draft, setDraft] = useState(() =>
    createInitialUnavailableShiftDraft({
      shifts: check.shifts,
      timeZone: churchTimezone,
    }),
  );
  const queryClient = useQueryClient();
  const answer = useMutation({
    mutationFn: () => {
      const body = buildUnavailableShiftsBody({ draft });
      return volunteerApi.answerAvailabilityCheck(check.id, body);
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(['availability-check', check.id], updated);
      await queryClient.invalidateQueries({
        queryKey: ['availability-checks'],
      });
      await onAnswered();
    },
  });
  const unavailable = draft.markedShiftIds.size;
  const total = check.shifts.length;
  const label =
    unavailable === 0
      ? m.availability_detail_confirm_all()
      : total === 1
        ? m.availability_detail_confirm_count_one({ unavailable, total })
        : m.availability_detail_confirm_count({ unavailable, total });
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
      </header>
      {[...days].map(([day, shifts]) => {
        const dayLabel = formatCalendarDayWithWeekday({
          day,
          locale: getLocale(),
        });
        return (
          <section key={day} aria-label={dayLabel} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <h2 className="font-semibold text-base">{dayLabel}</h2>
              <label
                htmlFor={`${switchPrefix}-day-${day}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
              >
                {m.availability_detail_whole_day()}
                <Switch
                  id={`${switchPrefix}-day-${day}`}
                  disabled={answer.isPending}
                  checked={draft.wholeDayDates.has(day)}
                  onCheckedChange={() =>
                    setDraft((current) =>
                      toggleWholeDayUnavailable({
                        draft: current,
                        shifts: check.shifts,
                        date: day,
                        timeZone: churchTimezone,
                      }),
                    )
                  }
                />
              </label>
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
                    {shift.label ? (
                      <p className="text-sm">{shift.label}</p>
                    ) : null}
                  </div>
                  <label
                    htmlFor={`${switchPrefix}-shift-${shift.shiftId}`}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                  >
                    {m.availability_detail_unavailable()}
                    <Switch
                      id={`${switchPrefix}-shift-${shift.shiftId}`}
                      disabled={answer.isPending}
                      checked={draft.markedShiftIds.has(shift.shiftId)}
                      onCheckedChange={() =>
                        setDraft((current) =>
                          toggleShiftUnavailable({
                            draft: current,
                            shifts: check.shifts,
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
      <div className="sticky bottom-20 z-10 border-t bg-background py-3 md:bottom-0">
        <Button
          size="touch"
          className="h-auto min-h-11 w-full whitespace-normal"
          disabled={answer.isPending}
          onClick={() => answer.mutate()}
        >
          {answer.isPending
            ? m.availability_detail_pending()
            : answer.isError
              ? m.availability_detail_answer_error()
              : label}
        </Button>
        {answer.isError ? (
          <p role="alert" className="pt-2 text-destructive text-sm">
            {label}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AvailabilityDetailContent({
  checkId,
  onAnswered,
}: AvailabilityDetailPageProps) {
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
  if (!query.data) return null;
  return (
    <AvailabilityAnswer
      key={checkId}
      check={query.data}
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
