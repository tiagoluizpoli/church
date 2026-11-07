import { m } from '@church/i18n/messages';
import {
  compareInstants,
  formatTimeOfDay,
  millisecondsBetween,
  now,
  parseInstant,
  today,
} from '@church/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useId, useState } from 'react';
import { z } from 'zod';
import { DatePickerField } from '@/components/date-picker-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { GetCycleAvailabilityStatus200StatusesItem } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  churchTimeOfDay,
  formatCalendarDateOnly,
} from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

const COOLDOWN_CLOCK_REFRESH_MS = 60_000;

const remindRefusalSchema = z.object({
  error: z.string(),
  message: z.string(),
  remindAvailableAt: z.iso.datetime().optional(),
});

interface ScheduleScope {
  cycleId: string;
  ministryId: string;
}

export interface AvailabilityStatusSectionProps extends ScheduleScope {
  readOnly?: boolean;
}

interface AnswerGroup {
  label: string;
  statuses: GetCycleAvailabilityStatus200StatusesItem[];
}

export function AvailabilityStatusSection({
  cycleId,
  ministryId,
  readOnly = false,
}: AvailabilityStatusSectionProps) {
  const queryClient = useQueryClient();
  const deadlineLabelId = useId();
  const queryKey = ['availability-status', cycleId, ministryId];
  const deadlineMutation = useMutation({
    mutationFn: (answerBy: string | null) =>
      adminApi.setAvailabilityDeadline(cycleId, { ministryId, answerBy }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  function refreshAnswers({ cycleId, ministryId }: ScheduleScope) {
    return queryClient.invalidateQueries({
      queryKey: ['availability-status', cycleId, ministryId],
    });
  }
  const remindMutation = useMutation({
    mutationFn: ({ cycleId, ministryId }: ScheduleScope) =>
      adminApi.remindSchedule(cycleId, { ministryId }),
    onSuccess: (_data, scope) => refreshAnswers(scope),
    onError: (_error, scope) => refreshAnswers(scope),
  });
  const statusQuery = useQuery({
    queryKey,
    queryFn: () => adminApi.getCycleAvailabilityStatus(cycleId, { ministryId }),
    retry: false,
  });
  const { churchTimezone } = useTimezone();
  const { data } = statusQuery;
  const currentRemind =
    remindMutation.variables?.cycleId === cycleId &&
    remindMutation.variables.ministryId === ministryId;
  const remindPending = currentRemind && remindMutation.isPending;
  const remindError = currentRemind && remindMutation.isError;
  const errorData: unknown =
    currentRemind && isAxiosError<unknown>(remindMutation.error)
      ? remindMutation.error.response?.data
      : undefined;
  const parsedRefusal = remindRefusalSchema.safeParse(errorData);
  const refusal = parsedRefusal.success ? parsedRefusal.data : undefined;
  const refusedUntil =
    refusal?.error === 'REMIND_ON_COOLDOWN'
      ? refusal.remindAvailableAt
      : undefined;
  const cooldownInstants = [
    data?.remindAvailableAt,
    currentRemind ? remindMutation.data?.remindAvailableAt : undefined,
    refusedUntil,
  ]
    .filter((value) => value != null)
    .map((value) => parseInstant({ value }));
  const remindAvailableAt = cooldownInstants.sort().at(-1);
  const [currentInstant, setCurrentInstant] = useState(now);
  useEffect(() => {
    if (!remindAvailableAt) return;
    const availableAt = remindAvailableAt;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function refreshClock() {
      const current = now();
      setCurrentInstant(current);
      const remaining = millisecondsBetween({
        start: current,
        end: availableAt,
      });
      if (remaining > 0) {
        const delay = Math.min(remaining, COOLDOWN_CLOCK_REFRESH_MS);
        timer = setTimeout(refreshClock, delay);
      }
    }
    refreshClock();
    return () => clearTimeout(timer);
  }, [remindAvailableAt]);
  const coolingDown = remindAvailableAt
    ? compareInstants({ left: currentInstant, right: remindAvailableAt }) < 0
    : false;
  const cooldownWallTime = remindAvailableAt
    ? churchTimeOfDay({ value: remindAvailableAt, timeZone: churchTimezone })
    : undefined;
  const cooldownTime = cooldownWallTime
    ? formatTimeOfDay({ time: cooldownWallTime })
    : '';
  const churchDay = today({ instant: now(), timeZone: churchTimezone });
  const overdue = data?.answerBy && data.answerBy < churchDay;
  const statuses = data?.statuses ?? [];
  const groups: AnswerGroup[] = [
    {
      label: m.answers_pending(),
      statuses: statuses.filter((status) => status.state !== 'confirmed'),
    },
    {
      label: m.answers_available(),
      statuses: statuses.filter(
        (status) =>
          status.state === 'confirmed' && status.unavailableShiftCount === 0,
      ),
    },
    {
      label: m.answers_unavailable(),
      statuses: statuses.filter(
        (status) =>
          status.state === 'confirmed' && status.unavailableShiftCount > 0,
      ),
    },
  ];

  return (
    <Card data-testid="availability-status-list">
      <CardHeader>
        <CardTitle>{m.answers_title()}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {statusQuery.isLoading ? (
          <div role="status" aria-label={m.answers_loading()}>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : statusQuery.isError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 text-destructive text-sm"
          >
            <span>{m.answers_error()}</span>
            <Button variant="outline" onClick={() => statusQuery.refetch()}>
              {m.schedules_retry()}
            </Button>
          </div>
        ) : data ? (
          <>
            <p className="text-sm tabular-nums">
              {data.confirmed === 1
                ? m.answers_count_one({
                    confirmed: data.confirmed,
                    asked: data.asked,
                  })
                : m.answers_count({
                    confirmed: data.confirmed,
                    asked: data.asked,
                  })}
            </p>
            {!readOnly ? (
              <Button
                variant="outline"
                className="h-auto min-h-11 whitespace-normal"
                disabled={remindPending || coolingDown}
                onClick={() => remindMutation.mutate({ cycleId, ministryId })}
              >
                {remindPending
                  ? m.answers_remind_pending()
                  : coolingDown
                    ? m.answers_remind_cooldown({ time: cooldownTime })
                    : m.answers_remind({ count: data.asked - data.confirmed })}
              </Button>
            ) : null}
            {!readOnly && remindError ? (
              <p role="alert" className="text-destructive text-sm">
                {refusedUntil && coolingDown
                  ? m.answers_remind_cooldown({ time: cooldownTime })
                  : (refusal?.message ?? m.answers_remind_error())}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                <span id={deadlineLabelId}>{m.answers_deadline()}</span>:{' '}
                {data.answerBy ? (
                  <time dateTime={data.answerBy}>
                    {formatCalendarDateOnly({ value: data.answerBy })}
                  </time>
                ) : (
                  <span>{m.answers_no_deadline()}</span>
                )}
              </span>
              {overdue ? (
                <span className="font-medium text-destructive">
                  {m.answers_overdue()}
                </span>
              ) : null}
            </div>
            {!readOnly ? (
              <div className="space-y-2">
                <div className="w-fit">
                  <DatePickerField
                    value={data.answerBy ?? ''}
                    aria-labelledby={deadlineLabelId}
                    placeholder={m.answers_no_deadline()}
                    disabled={deadlineMutation.isPending}
                    onChange={(answerBy) => deadlineMutation.mutate(answerBy)}
                    onClear={() => deadlineMutation.mutate(null)}
                  />
                </div>
                <p className="text-muted-foreground text-sm">
                  {m.answers_deadline_silent()}
                </p>
                {deadlineMutation.isError ? (
                  <p role="alert" className="text-destructive text-sm">
                    {m.answers_deadline_error()}
                  </p>
                ) : null}
              </div>
            ) : null}
            {statuses.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {m.answers_empty()}
              </p>
            ) : (
              groups.map((group) => (
                <section key={group.label} className="space-y-2">
                  <h3 className="font-medium text-sm">{group.label}</h3>
                  <ul aria-label={group.label} className="divide-y">
                    {group.statuses.map((status) => (
                      <li
                        key={status.volunteerId}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                      >
                        <span>{status.volunteerName}</span>
                        {status.state === 'confirmed' &&
                        status.unavailableShiftCount > 0 ? (
                          <span className="text-muted-foreground">
                            {status.shiftCount === 1
                              ? m.answers_unavailable_count_one({
                                  unavailable: status.unavailableShiftCount,
                                  total: status.shiftCount,
                                })
                              : m.answers_unavailable_count({
                                  unavailable: status.unavailableShiftCount,
                                  total: status.shiftCount,
                                })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
