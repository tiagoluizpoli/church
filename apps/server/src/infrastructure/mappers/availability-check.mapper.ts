import type { availabilityCheck } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  AvailabilityCheckId,
  ChurchId,
  PlanningCycleId,
} from '../../domain/branded-ids';
import type { AvailabilityCheckProps } from '../../domain/entities/availability-check';
import { AvailabilityCheck } from '../../domain/entities/availability-check';

type AvailabilityCheckRow = InferSelectModel<typeof availabilityCheck>;

export function mapAvailabilityCheck(
  row: AvailabilityCheckRow,
): AvailabilityCheck {
  const props: AvailabilityCheckProps = {
    churchId: row.churchId as ChurchId,
    planningCycleId: row.planningCycleId as PlanningCycleId,
    ministryVolunteerId: row.ministryVolunteerId,
    state: row.state as AvailabilityCheckProps['state'],
    confirmedAt: row.confirmedAt ?? undefined,
  };

  return new AvailabilityCheck({
    props,
    id: row.id as AvailabilityCheckId,
    createdAt: row.createdAt,
  });
}
