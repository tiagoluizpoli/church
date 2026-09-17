import type { planningCycle } from '@church/db';
import { parseCalendarDay } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId, PlanningCycleId } from '../../domain/branded-ids';
import type { PlanningCycleProps } from '../../domain/entities/planning-cycle';
import { PlanningCycle } from '../../domain/entities/planning-cycle';

type PlanningCycleRow = InferSelectModel<typeof planningCycle>;

/** The `date`-mode column is a `Date` at UTC midnight of the stored day —
 * its ISO date slice is the CalendarDay, with no timezone involved. */
function dateColumnToCalendarDay(date: Date) {
  return parseCalendarDay({ value: date.toISOString().slice(0, 10) });
}

export function mapPlanningCycle(row: PlanningCycleRow): PlanningCycle {
  const props: PlanningCycleProps = {
    churchId: row.churchId as ChurchId,
    name: row.name,
    startDate: dateColumnToCalendarDay(row.startDate),
    endDate: dateColumnToCalendarDay(row.endDate),
    state: row.state as PlanningCycleProps['state'],
  };

  return new PlanningCycle({
    props,
    id: row.id as PlanningCycleId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
