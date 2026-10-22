import type { ministry } from '@church/db';
import { fromDate } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId, MinistryId } from '../../domain/branded-ids';
import type { MinistryProps } from '../../domain/entities/ministry';
import { Ministry } from '../../domain/entities/ministry';

type MinistryRow = InferSelectModel<typeof ministry>;

export function mapMinistry(row: MinistryRow): Ministry {
  const props: MinistryProps = {
    churchId: row.churchId as ChurchId,
    name: row.name,
    description: row.description ?? undefined,
    defaultDirection: row.defaultDirection,
    deletedAt: row.deletedAt ? fromDate({ date: row.deletedAt }) : undefined,
  };

  return new Ministry({
    props,
    id: row.id as MinistryId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
