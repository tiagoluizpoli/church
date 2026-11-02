import { DomainError } from '@church/core';

interface ArchiveBlockerBase {
  ministryId: string;
  ministryName: string;
}

/** A Cycle whose not-yet-past Event still involves the archived item. */
export interface CycleArchiveBlocker extends ArchiveBlockerBase {
  kind: 'cycle';
  cycleId: string;
  cycleName: string;
}

/** An upcoming ShiftRequirement, located by its Event Time Block. */
export interface RequirementArchiveBlocker extends ArchiveBlockerBase {
  kind: 'requirement';
  cycleId: string;
  cycleName: string;
  eventId: string;
  eventTimeBlockId: string;
}

/** A retained UsualSetup headcount, located by its Template Time Block. */
export interface UsualSetupArchiveBlocker extends ArchiveBlockerBase {
  kind: 'usual_setup';
  templateTimeBlockId: string;
}

export type ArchiveBlocker =
  | CycleArchiveBlocker
  | RequirementArchiveBlocker
  | UsualSetupArchiveBlocker;

export interface ArchiveBlockedErrorInput {
  message: string;
  blockers: ArchiveBlocker[];
}

/** An archive refused by current planning; `blockers` reach the 409 body. */
export abstract class ArchiveBlockedError extends DomainError {
  readonly blockers: ArchiveBlocker[];

  constructor({ message, blockers }: ArchiveBlockedErrorInput) {
    super(message);
    this.blockers = blockers;
  }
}
