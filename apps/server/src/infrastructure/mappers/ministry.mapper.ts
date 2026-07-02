import type { ministry } from '@church/db';
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
    enforcementType: row.enforcementType as MinistryProps['enforcementType'],
    deletedAt: row.deletedAt ?? undefined,
  };

  return new Ministry(
    props,
    row.id as MinistryId,
    row.createdAt,
    row.updatedAt,
  );
}
