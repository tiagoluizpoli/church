import type { ChurchId, MinistryId } from '../../domain/branded-ids';
import type { MinistryProps } from '../../domain/entities/ministry';
import { Ministry } from '../../domain/entities/ministry';
import { assertEnum } from './mapper-utils';

const ENFORCEMENT_TYPES = ['soft', 'hard'] as const;

export function mapMinistry(row: {
  id: string;
  churchId: string;
  name: string;
  description: string | null;
  enforcementType: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Ministry {
  const props: MinistryProps = {
    churchId: row.churchId as ChurchId,
    name: row.name,
    description: row.description ?? undefined,
    enforcementType: assertEnum({
      field: 'enforcementType',
      value: row.enforcementType,
      valid: ENFORCEMENT_TYPES,
    }),
    deletedAt: row.deletedAt ?? undefined,
  };

  return new Ministry(
    props,
    row.id as MinistryId,
    row.createdAt,
    row.updatedAt,
  );
}
