import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CYCLE_BUILDER_QUERY_KEY } from '@/features/scheduling/hooks/use-cycle-builder';
import {
  isConflict,
  isStaleRaise,
} from '@/features/volunteers/lib/http-status';
import type { ListMinistrySwapRequests200SchedulesItemRequestsItem } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  formatInstantOf,
  formatInstantRangeOf,
} from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

export type LeaderSwapRequest =
  ListMinistrySwapRequests200SchedulesItemRequestsItem;

interface SwapRequestSheetProps {
  ministryId: string;
  request: LeaderSwapRequest;
  onOpenChange: (open: boolean) => void;
}

interface FactProps {
  label: string;
  children: React.ReactNode;
}

function Fact({ label, children }: FactProps) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Keep them on answers the request; Cover is the board's own move/reassign/remove actions. */
export function SwapRequestSheet({
  ministryId,
  request,
  onOpenChange,
}: SwapRequestSheetProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const keep = useMutation({
    mutationFn: () =>
      adminApi.keepSwapRequest(ministryId, request.id, {
        reply: reply.trim() || undefined,
      }),
    onSuccess: () => onOpenChange(false),
    // A stale sheet (409/404) lands on the current state: the refetch drops or relabels the request.
    onSettled: (_data, error) =>
      Promise.all(
        [
          ['ministry-swap-requests'],
          CYCLE_BUILDER_QUERY_KEY,
          ['prepare-schedules'],
          ['assignment-detail'],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ).then(() => {
        if (error && isStaleRaise(error)) onOpenChange(false);
      }),
  });
  const { startsAt, endsAt, raisedAt, status, note } = request;
  const isExpired = status === 'expired';
  return (
    <ResponsiveFormSurface
      open
      onOpenChange={onOpenChange}
      title={m.swap_board_sheet_title()}
      description={m.swap_board_sheet_description()}
      footer={
        <>
          <Button
            variant="outline"
            size="touch"
            onClick={() => onOpenChange(false)}
          >
            {m.swap_board_close()}
          </Button>
          {isExpired ? null : (
            <Button
              size="touch"
              disabled={keep.isPending}
              onClick={() => keep.mutate()}
            >
              {m.swap_board_keep()}
            </Button>
          )}
        </>
      }
    >
      <dl className="space-y-3" data-testid="swap-request-sheet">
        <Fact label={m.swap_board_volunteer()}>{request.volunteerName}</Fact>
        <Fact label={m.swap_board_shift()}>
          {formatInstantRangeOf({ start: startsAt, end: endsAt, timeZone })} ·{' '}
          {request.eventTitle}
        </Fact>
        <Fact label={m.swap_board_sector_role()}>
          {request.sectorName} × {request.roleName}
        </Fact>
        {note ? <Fact label={m.swap_board_note()}>{note}</Fact> : null}
        <Fact label={m.swap_board_raised_at()}>
          {formatInstantOf({ value: raisedAt, timeZone })}
        </Fact>
        <Fact label={m.swap_board_status()}>
          <Badge variant={isExpired ? 'outline' : 'secondary'}>
            {isExpired
              ? m.swap_board_status_expired()
              : m.swap_board_status_open()}
          </Badge>
        </Fact>
      </dl>
      {isExpired ? (
        <p className="text-muted-foreground text-sm">
          {m.swap_board_expired_hint()}
        </p>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="swap-keep-reply">{m.swap_board_reply_label()}</Label>
          <Textarea
            id="swap-keep-reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          />
          <p className="text-muted-foreground text-sm">
            {m.swap_board_cover_hint()}
          </p>
          {keep.isError &&
          !isConflict(keep.error) &&
          !isStaleRaise(keep.error) ? (
            <p role="alert" className="text-destructive text-sm">
              {m.swap_board_keep_error()}
            </p>
          ) : null}
        </div>
      )}
    </ResponsiveFormSurface>
  );
}
