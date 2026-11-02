import { DomainError } from '@church/core';
import type { CycleId, MinistryId } from '../branded-ids';

/** A Cycle whose not-yet-ended Event the Ministry still participates in. */
export interface CycleArchiveBlocker {
  kind: 'cycle';
  ministryId: MinistryId;
  ministryName: string;
  cycleId: CycleId;
  cycleName: string;
}

interface MinistryInUseErrorInput {
  blockers: CycleArchiveBlocker[];
}

/** Archive refused: the Ministry still participates in an Event that has not ended. */
export class MinistryInUseError extends DomainError {
  readonly code = 'MINISTRY_IN_USE' as const;
  readonly blockers: CycleArchiveBlocker[];

  constructor({ blockers }: MinistryInUseErrorInput) {
    super('The Ministry participates in Events that have not ended');
    this.blockers = blockers;
  }
}
