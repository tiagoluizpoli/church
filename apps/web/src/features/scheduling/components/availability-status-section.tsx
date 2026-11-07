import { m } from '@church/i18n/messages';
import { now, today } from '@church/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { DatePickerField } from '@/components/date-picker-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { GetCycleAvailabilityStatus200StatusesItem } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

export interface AvailabilityStatusSectionProps {
  cycleId: string;
  ministryId: string;
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
  const statusQuery = useQuery({
    queryKey,
    queryFn: () => adminApi.getCycleAvailabilityStatus(cycleId, { ministryId }),
    retry: false,
  });
  const { churchTimezone } = useTimezone();
  const { data } = statusQuery;
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
