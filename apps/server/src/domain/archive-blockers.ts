/**
 * Where an item still in use blocks its archive, as typed locations the web
 * links to (never parsed from a localized message).
 */
/** A Cycle whose not-yet-ended Event the Ministry still participates in. */
export interface CycleArchiveBlocker {
  kind: 'cycle';
  ministryId: string;
  ministryName: string;
  cycleId: string;
  cycleName: string;
}

export interface RequirementArchiveBlocker {
  kind: 'requirement';
  ministryId: string;
  ministryName: string;
  cycleId: string;
  cycleName: string;
  eventId: string;
  eventTimeBlockId: string;
}

export interface UsualSetupArchiveBlocker {
  kind: 'usual_setup';
  ministryId: string;
  ministryName: string;
  templateTimeBlockId: string;
}

export type ArchiveBlocker =
  | CycleArchiveBlocker
  | RequirementArchiveBlocker
  | UsualSetupArchiveBlocker;
