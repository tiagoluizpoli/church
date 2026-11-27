import type { SQLWrapper } from 'drizzle-orm';
import type { SchedulePair } from '../../domain/contracts/infrastructure/ministry-participation.repository';
import type { ScheduleStage } from '../../domain/entities/ministry-participation';
import type { AnyDrizzleDb } from './drizzle-db.types';

export interface StepCaseInput {
  step: SQLWrapper;
  literalOf: (stage: ScheduleStage) => string;
}

export interface InSchedulesInput {
  ministryColumn: SQLWrapper;
  cycleColumn: SQLWrapper;
  schedules: SchedulePair[];
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
