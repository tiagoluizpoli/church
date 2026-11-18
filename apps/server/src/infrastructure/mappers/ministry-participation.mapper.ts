import type {
  ministryParticipation,
  participationEventTimeBlockInclusion,
} from '@church/db';
import { fromDate } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  ParticipationEventTimeBlockInclusionId,
} from '../../domain/branded-ids';
import type { MinistryParticipationProps } from '../../domain/entities/ministry-participation';
import { MinistryParticipation } from '../../domain/entities/ministry-participation';
import type { ParticipationEventTimeBlockInclusionProps } from '../../domain/entities/participation-event-time-block-inclusion';
import { ParticipationEventTimeBlockInclusion } from '../../domain/entities/participation-event-time-block-inclusion';

type MinistryParticipationRow = InferSelectModel<typeof ministryParticipation>;
type ParticipationEventTimeBlockInclusionRow = InferSelectModel<
  typeof participationEventTimeBlockInclusion
>;

export function mapMinistryParticipation(
  row: MinistryParticipationRow,
): MinistryParticipation {
  const props: MinistryParticipationProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as MinistryId,
    eventId: row.eventId as EventId,
    state: row.state as MinistryParticipationProps['state'],
    touchedAt: row.touchedAt ? fromDate({ date: row.touchedAt }) : null,
  };

  return new MinistryParticipation({
    props,
    id: row.id as MinistryParticipationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function mapParticipationEventTimeBlockInclusion(
  row: ParticipationEventTimeBlockInclusionRow,
): ParticipationEventTimeBlockInclusion {
  const props: ParticipationEventTimeBlockInclusionProps = {
    churchId: row.churchId as ChurchId,
    participationId: row.participationId as MinistryParticipationId,
    eventTimeBlockId: row.eventTimeBlockId as EventTimeBlockId,
  };

  return new ParticipationEventTimeBlockInclusion({
    props,
    id: row.id as ParticipationEventTimeBlockInclusionId,
  });
}
