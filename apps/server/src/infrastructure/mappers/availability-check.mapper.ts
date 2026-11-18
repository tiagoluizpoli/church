import type { availabilityCheck } from '@church/db';
import { fromDate } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  AvailabilityCheckId,
  ChurchId,
  CycleId,
} from '../../domain/branded-ids';
import type { AvailabilityCheckProps } from '../../domain/entities/availability-check';
import { AvailabilityCheck } from '../../domain/entities/availability-check';

type AvailabilityCheckRow = InferSelectModel<typeof availabilityCheck>;

export function mapAvailabilityCheck(
  row: AvailabilityCheckRow,
): AvailabilityCheck {
  const props: AvailabilityCheckProps = {
    churchId: row.churchId as ChurchId,
    cycleId: row.cycleId as CycleId,
    ministryMembershipId: row.ministryMembershipId,
    state: row.state as AvailabilityCheckProps['state'],
    confirmedAt: row.confirmedAt
      ? fromDate({ date: row.confirmedAt })
      : undefined,
  };

  return new AvailabilityCheck({
    props,
    id: row.id as AvailabilityCheckId,
    createdAt: row.createdAt,
  });
}
