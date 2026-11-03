/**
 * An active Assignment on a non-cancelled Event that has not ended, which a
 * Role removal or Membership end would leave without its qualification. The
 * typed blocker of a 409 `UPCOMING_ASSIGNMENTS`; the web links it to the
 * leader-capable Assign board of `ministryId`/`cycleId`.
 */
export interface UpcomingMembershipAssignment {
  assignmentId: string;
  eventId: string;
  eventTitle: string;
  eventTimeBlockId: string;
  shiftId: string;
  /** Instants, ISO-8601 UTC. */
  shiftStart: string;
  shiftEnd: string;
  roleId: string;
  roleName: string;
  sectorId: string;
  sectorName: string;
  ministryId: string;
  cycleId: string;
}
