import type { ChurchId } from '../../domain/entities/church';
import type {
  UserId,
  VolunteerId,
  VolunteerProps,
} from '../../domain/entities/volunteer';
import { Volunteer } from '../../domain/entities/volunteer';
import { assertEnum } from './mapper-utils';

const VOLUNTEER_STATUSES = ['active', 'inactive', 'on_hold'] as const;

export function mapVolunteer(
  row: {
    id: string;
    churchId: string;
    userId: string;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  name?: string | null,
): Volunteer {
  const props: VolunteerProps = {
    churchId: row.churchId as ChurchId,
    userId: row.userId as UserId,
    status: assertEnum({
      field: 'status',
      value: row.status,
      valid: VOLUNTEER_STATUSES,
    }),
    notes: row.notes ?? undefined,
    name: name ?? undefined,
  };

  return new Volunteer(
    props,
    row.id as VolunteerId,
    row.createdAt,
    row.updatedAt,
  );
}
