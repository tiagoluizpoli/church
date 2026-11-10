import { m } from '@church/i18n/messages';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ListMinistrySwapRequests200SchedulesItemRequestsItem } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import {
  formatInstantOf,
  formatInstantRangeOf,
} from '@/shared/utils/church-time';

export type LeaderSwapRequest =
  ListMinistrySwapRequests200SchedulesItemRequestsItem;

interface SwapRequestSheetProps {
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

/** Read-only: Keep and Cover arrive with the next slices. */
export function SwapRequestSheet({
  request,
  onOpenChange,
}: SwapRequestSheetProps) {
  const { churchTimezone: timeZone } = useTimezone();
  const { startsAt, endsAt, raisedAt, status, note } = request;
  const isExpired = status === 'expired';
  return (
    <ResponsiveFormSurface
      open
      onOpenChange={onOpenChange}
      title={m.swap_board_sheet_title()}
      description={m.swap_board_sheet_description()}
      footer={
        <Button
          variant="outline"
          size="touch"
          onClick={() => onOpenChange(false)}
        >
          {m.swap_board_close()}
        </Button>
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
      ) : null}
    </ResponsiveFormSurface>
  );
}
