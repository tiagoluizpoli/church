import type { volunteer } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId } from '../../domain/entities/church';
import type {
  UserId,
  VolunteerId,
  VolunteerProps,
} from '../../domain/entities/volunteer';
import { Volunteer } from '../../domain/entities/volunteer';

type VolunteerRow = InferSelectModel<typeof volunteer>;

export function mapVolunteer(
  row: VolunteerRow,
  name?: string | null,
): Volunteer {
  const props: VolunteerProps = {
    churchId: row.churchId as ChurchId,
    userId: row.userId as UserId,
    status: row.status as VolunteerProps['status'],
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
