/**
 * Where an item still in use blocks its archive, as typed locations the web
 * links to (never parsed from a localized message).
 */
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
  | RequirementArchiveBlocker
  | UsualSetupArchiveBlocker;
