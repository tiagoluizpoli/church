import { fromDate } from '@church/time';
import type { ChurchId, UserId, VolunteerId } from '../../domain/branded-ids';
import type { VolunteerProps } from '../../domain/entities/volunteer';
import { Volunteer } from '../../domain/entities/volunteer';
import type { MapVolunteerInput } from './volunteer.mapper.types';

export function mapVolunteer({ row, name }: MapVolunteerInput): Volunteer {
  const props: VolunteerProps = {
    churchId: row.churchId as ChurchId,
    userId: row.userId as UserId,
    status: row.status as VolunteerProps['status'],
    notes: row.notes ?? undefined,
    leftAt: row.leftAt ? fromDate({ date: row.leftAt }) : undefined,
    successorVolunteerId:
      (row.successorVolunteerId as VolunteerId) ?? undefined,
    name: name ?? undefined,
  };

  return new Volunteer({
    props,
    id: row.id as VolunteerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
