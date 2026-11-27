import type { Recurrence } from '../../domain/recurrence';
import type { AnyDrizzleDb } from './drizzle-db.types';

export interface BlockTimes {
  startTime: string;
  endTime: string;
}

export interface WinnerBlock {
  recurrence: Recurrence;
  block: BlockTimes;
}

export interface DrizzleChurchProgrammeRepositoryInput {
  db: AnyDrizzleDb;
}
