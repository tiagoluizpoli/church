import type { SQLWrapper } from 'drizzle-orm';
import type { ScheduleStage } from '../../domain/entities/ministry-participation';
import type { AnyDrizzleDb } from './types';

export interface StepCaseInput {
  step: SQLWrapper;
  literalOf: (stage: ScheduleStage) => string;
}

export interface ListKey {
  column: SQLWrapper;
  value: unknown;
  descending?: boolean;
}

export interface AfterPositionInput {
  /** The list order's keys, most significant first. */
  keys: ListKey[];
}

export interface DrizzleMinistryParticipationRepositoryInput {
  db: AnyDrizzleDb;
}
