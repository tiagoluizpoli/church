import type { ChurchId, RoleId } from '../../domain/branded-ids';
import type { RoleProps } from '../../domain/entities/role';
import { Role } from '../../domain/entities/role';

export function mapRole(row: {
  id: string;
  churchId: string;
  ministryId: string | null;
  name: string;
  isGlobal: boolean;
}): Role {
  const props: RoleProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId
      ? (row.ministryId as RoleProps['ministryId'])
      : undefined,
    name: row.name,
    isGlobal: row.isGlobal,
  };

  return new Role(props, row.id as RoleId);
}
