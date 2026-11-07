import { m } from '@church/i18n/messages';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { DatePickerField } from '@/components/date-picker-field';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { GetAskPreview200 } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantOf } from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';
import { adminApi } from '@/utils/api-instances';

const askRefusalSchema = z.object({
  error: z.string(),
  message: z.string(),
  flaggedBlocks: z
    .array(
      z.object({ eventTimeBlockId: z.string(), startsAt: z.iso.datetime() }),
    )
    .optional(),
});

interface ScheduleAskProps {
  ministryId: string;
  cycleId: string;
}

export function ScheduleAsk({ ministryId, cycleId }: ScheduleAskProps) {
  const { churchTimezone } = useTimezone();
  const [open, setOpen] = useState(false);
  const [answerBy, setAnswerBy] = useState('');
  const deadlineId = useId();
  const preview = useQuery({
    queryKey: ['prepare-ask-preview', ministryId, cycleId],
    queryFn: () => adminApi.getAskPreview(cycleId, { ministryId }),
    retry: false,
  });
  const previewStatus = isAxiosError<unknown>(preview.error)
    ? preview.error.response?.status
    : undefined;
  const queryClient = useQueryClient();
  async function refreshSchedule() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['prepare-schedules'] }),
      queryClient.invalidateQueries({
        queryKey: ['prepare-cycle-participation', ministryId, cycleId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['prepare-ask-preview', ministryId, cycleId],
      }),
    ]);
  }
  const ask = useMutation({
    mutationFn: () =>
      adminApi.askScheduleAvailability(cycleId, {
        ministryId,
        ...(answerBy ? { answerBy } : {}),
      }),
    onSuccess: async () => {
      setOpen(false);
      await refreshSchedule();
      toast.success(m.prepare_ask_sent());
    },
    onError: refreshSchedule,
  });
  const errorData: unknown = isAxiosError<unknown>(ask.error)
    ? ask.error.response?.data
    : undefined;
  const parsedRefusal = askRefusalSchema.safeParse(errorData);
  const refusal = parsedRefusal.success ? parsedRefusal.data : undefined;
  const invalidDeadline = refusal?.error === 'VALIDATION_ERROR';
  const flaggedBlocks =
    (open ? refusal?.flaggedBlocks : undefined) ??
    preview.data?.flaggedBlocks ??
    [];
  const flaggedLinks = flaggedBlocks.map(({ eventTimeBlockId, startsAt }) => (
    <Link
      key={eventTimeBlockId}
      to="/schedules/$ministryId/$cycleId/slots/$timeSlotId"
      params={{ ministryId, cycleId, timeSlotId: eventTimeBlockId }}
      className="underline underline-offset-4"
    >
      {formatInstantOf({ value: startsAt, timeZone: churchTimezone })}
    </Link>
  ));
  if (preview.data?.shiftCount === 0) return null;
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <Button
        onClick={() => {
          setAnswerBy('');
          ask.reset();
          setOpen(true);
        }}
        aria-describedby={
          flaggedBlocks.length > 0 ? `${deadlineId}-flagged` : undefined
        }
        disabled={
          preview.isFetching ||
          preview.isError ||
          !preview.data ||
          flaggedBlocks.length > 0
        }
      >
        {m.prepare_ask()}
      </Button>
      {preview.isFetching ? (
        <span
          role="status"
          aria-label={m.prepare_ask_loading()}
          className="text-muted-foreground text-sm"
        >
          {m.prepare_ask_loading()}
        </span>
      ) : null}
      {preview.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {previewStatus === 403
              ? m.shell_no_access()
              : previewStatus === 404
                ? m.error_not_found()
                : m.prepare_ask_preview_error()}
            {previewStatus !== 403 && previewStatus !== 404 ? (
              <Button
                variant="outline"
                disabled={preview.isFetching}
                onClick={() => preview.refetch()}
              >
                {m.schedules_retry()}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {preview.data ? (
        <ResponsiveFormSurface
          open={open}
          onOpenChange={(nextOpen) => {
            if (!ask.isPending) setOpen(nextOpen);
          }}
          title={m.prepare_ask()}
          description={askCounts(preview.data)}
          footer={
            <>
              <Button
                variant="outline"
                disabled={ask.isPending}
                onClick={() => setOpen(false)}
              >
                {m.prepare_ask_cancel()}
              </Button>
              <Button
                onClick={() => ask.mutate()}
                disabled={
                  ask.isPending ||
                  flaggedBlocks.length > 0 ||
                  preview.data.eligibleVolunteerCount === 0
                }
              >
                {ask.isPending ? m.prepare_ask_pending() : m.prepare_ask()}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {ask.isError ? (
              <Alert variant="destructive" id={`${deadlineId}-error`}>
                <AlertDescription>
                  {refusal?.message ?? m.common_generic_error()}
                </AlertDescription>
              </Alert>
            ) : null}
            {flaggedLinks.length > 0 ? (
              <div className="flex flex-col gap-1 text-sm">{flaggedLinks}</div>
            ) : null}
            {preview.data.eligibleVolunteerCount === 0 ? (
              <p role="status">{m.prepare_ask_zero_eligible()}</p>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label id={`${deadlineId}-label`} htmlFor={deadlineId}>
                {m.prepare_ask_deadline()}
              </Label>
              <DatePickerField
                id={deadlineId}
                aria-labelledby={`${deadlineId}-label`}
                aria-invalid={invalidDeadline}
                aria-describedby={
                  invalidDeadline ? `${deadlineId}-error` : `${deadlineId}-hint`
                }
                value={answerBy}
                disabled={ask.isPending}
                onChange={setAnswerBy}
                onClear={() => setAnswerBy('')}
                data-testid="prepare-ask-deadline"
              />
              <p
                id={`${deadlineId}-hint`}
                className="text-muted-foreground text-sm"
              >
                {m.prepare_ask_deadline_hint()}
              </p>
            </div>
            {preview.data.rolesWithoutHolders.map(
              ({ roleId, roleName, shiftCount }) => {
                const shifts = shiftCountLabel({ count: shiftCount });
                const warning = m.prepare_ask_role_warning({
                  role: roleName,
                  shifts,
                });
                return (
                  <div key={roleId} className="flex flex-col gap-2 text-sm">
                    <p>{warning}</p>
                    <div className="flex flex-wrap gap-3">
                      <Link
                        to="/people"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4"
                      >
                        {m.nav_people()}
                      </Link>
                      <Link
                        to="/invitations"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4"
                      >
                        {m.nav_invitations()}
                      </Link>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </ResponsiveFormSurface>
      ) : null}
      {!open && flaggedBlocks.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <p id={`${deadlineId}-flagged`}>{m.prepare_ask_flagged()}</p>
          {flaggedLinks}
        </div>
      ) : null}
    </div>
  );
}

interface CountInput {
  count: number;
}

function shiftCountLabel({ count }: CountInput) {
  return pluralMessage({
    count,
    one: m.prepare_ask_shifts_one,
    other: () => m.prepare_ask_shifts_other({ count }),
  });
}

function askCounts({
  eligibleVolunteerCount,
  shiftCount,
  eventCount,
}: GetAskPreview200) {
  const volunteers = pluralMessage({
    count: eligibleVolunteerCount,
    one: m.prepare_ask_volunteers_one,
    other: () =>
      m.prepare_ask_volunteers_other({ count: eligibleVolunteerCount }),
  });
  const shifts = shiftCountLabel({ count: shiftCount });
  const events = pluralMessage({
    count: eventCount,
    one: m.prepare_ask_events_one,
    other: () => m.prepare_ask_events_other({ count: eventCount }),
  });
  return m.prepare_ask_counts({ volunteers, shifts, events });
}
