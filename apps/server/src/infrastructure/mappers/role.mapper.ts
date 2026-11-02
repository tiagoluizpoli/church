import type { role } from '@church/db';
import { fromDate } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId, RoleId } from '../../domain/branded-ids';
import type { RoleProps } from '../../domain/entities/role';
import { Role } from '../../domain/entities/role';

type RoleRow = InferSelectModel<typeof role>;

export function mapRole(row: RoleRow): Role {
  const props: RoleProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as RoleProps['ministryId'],
    name: row.name,
    archivedAt: row.archivedAt ? fromDate({ date: row.archivedAt }) : undefined,
  };

  return new Role({ props, id: row.id as RoleId });
}
