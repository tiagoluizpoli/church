import type { cycle } from '@church/db';
import { fromDateColumn } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId, CycleId } from '../../domain/branded-ids';
import type { CycleProps } from '../../domain/entities/cycle';
import { Cycle } from '../../domain/entities/cycle';

type CycleRow = InferSelectModel<typeof cycle>;

export function mapCycle(row: CycleRow): Cycle {
  const props: CycleProps = {
    churchId: row.churchId as ChurchId,
    name: row.name,
    startDate: fromDateColumn({ date: row.startDate }),
    endDate: fromDateColumn({ date: row.endDate }),
    state: row.state as CycleProps['state'],
  };

  return new Cycle({
    props,
    id: row.id as CycleId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
