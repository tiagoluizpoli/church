import type {
  ministryParticipation,
  participationSlotInclusion,
} from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  EventId,
  MinistryId,
  MinistryParticipationId,
  ParticipationSlotInclusionId,
  TimeSlotId,
} from '../../domain/branded-ids';
import type { MinistryParticipationProps } from '../../domain/entities/ministry-participation';
import { MinistryParticipation } from '../../domain/entities/ministry-participation';
import type { ParticipationSlotInclusionProps } from '../../domain/entities/participation-slot-inclusion';
import { ParticipationSlotInclusion } from '../../domain/entities/participation-slot-inclusion';

type MinistryParticipationRow = InferSelectModel<typeof ministryParticipation>;
type ParticipationSlotInclusionRow = InferSelectModel<
  typeof participationSlotInclusion
>;

export function mapMinistryParticipation(
  row: MinistryParticipationRow,
): MinistryParticipation {
  const props: MinistryParticipationProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as MinistryId,
    eventId: row.eventId as EventId,
    state: row.state as MinistryParticipationProps['state'],
    touchedAt: row.touchedAt,
  };

  return new MinistryParticipation({
    props,
    id: row.id as MinistryParticipationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function mapParticipationSlotInclusion(
  row: ParticipationSlotInclusionRow,
): ParticipationSlotInclusion {
  const props: ParticipationSlotInclusionProps = {
    churchId: row.churchId as ChurchId,
    participationId: row.participationId as MinistryParticipationId,
    timeSlotId: row.timeSlotId as TimeSlotId,
  };

  return new ParticipationSlotInclusion({
    props,
    id: row.id as ParticipationSlotInclusionId,
  });
}
