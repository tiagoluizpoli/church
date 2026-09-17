import type { planningCycle } from '@church/db';
import { fromDateColumn } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId, PlanningCycleId } from '../../domain/branded-ids';
import type { PlanningCycleProps } from '../../domain/entities/planning-cycle';
import { PlanningCycle } from '../../domain/entities/planning-cycle';

type PlanningCycleRow = InferSelectModel<typeof planningCycle>;

export function mapPlanningCycle(row: PlanningCycleRow): PlanningCycle {
  const props: PlanningCycleProps = {
    churchId: row.churchId as ChurchId,
    name: row.name,
    startDate: fromDateColumn({ date: row.startDate }),
    endDate: fromDateColumn({ date: row.endDate }),
    state: row.state as PlanningCycleProps['state'],
  };

  return new PlanningCycle({
    props,
    id: row.id as PlanningCycleId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
