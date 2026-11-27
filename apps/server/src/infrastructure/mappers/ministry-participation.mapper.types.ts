import type {
  ministryParticipation,
  participationEventTimeBlockInclusion,
} from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type MinistryParticipationRow = InferSelectModel<
  typeof ministryParticipation
>;

export type ParticipationEventTimeBlockInclusionRow = InferSelectModel<
  typeof participationEventTimeBlockInclusion
>;
