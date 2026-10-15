import { availabilityCheck, unavailableShift } from '@church/db';
import { type Instant, toDate } from '@church/time';
import type { SeedWriter } from '../recipe';
import { requireInsertedRow } from './require-inserted-row';

/**
 * Direct-state builders for a requested availability round: the check one
 * Ministry Membership answers per Cycle, and the unavailable shifts
 * hanging off it (a Volunteer is available unless marked).
 */

export type SeededAvailabilityCheck = typeof availabilityCheck.$inferSelect;
export type SeededUnavailableShift = typeof unavailableShift.$inferSelect;

export interface BuildConfirmedAvailabilityCheckInput {
  db: SeedWriter;
  churchId: string;
  cycleId: string;
  ministryMembershipId: string;
  id: string;
  /** Explicit, so a graph never depends on the wall clock at load time. */
  confirmedAt: Instant;
}

/** A check the Volunteer has answered, with or without unavailable shifts. */
export async function buildConfirmedAvailabilityCheck({
  db,
  churchId,
  cycleId,
  ministryMembershipId,
  id,
  confirmedAt,
}: BuildConfirmedAvailabilityCheckInput): Promise<SeededAvailabilityCheck> {
  return requireInsertedRow({
    rows: await db
      .insert(availabilityCheck)
      .values({
        id,
        churchId,
        cycleId,
        ministryMembershipId,
        state: 'confirmed',
        confirmedAt: toDate({ instant: confirmedAt }),
      })
      .returning(),
    description: `Availability Check ${id}`,
  });
}

export interface BuildUnavailableShiftInput {
  db: SeedWriter;
  churchId: string;
  availabilityCheckId: string;
  shiftId: string;
  id?: string;
}

/** The Volunteer cannot serve this Shift. */
export async function buildUnavailableShift({
  db,
  churchId,
  availabilityCheckId,
  shiftId,
  id,
}: BuildUnavailableShiftInput): Promise<SeededUnavailableShift> {
  return requireInsertedRow({
    rows: await db
      .insert(unavailableShift)
      .values({ id, churchId, availabilityCheckId, shiftId })
      .returning(),
    description: `Unavailable shift ${id}`,
  });
}

export type AvailabilityCheckState = SeededAvailabilityCheck['state'];

export interface BuildAvailabilityCheckInput {
  db: SeedWriter;
  churchId: string;
  cycleId: string;
  ministryMembershipId: string;
  id?: string;
  /** Left to the column default (pending) when a fixture does not care. */
  state?: AvailabilityCheckState;
}

/** A Ministry Membership's Availability Check, not yet answered unless `state` says so. */
export async function buildAvailabilityCheck({
  db,
  churchId,
  cycleId,
  ministryMembershipId,
  id,
  state,
}: BuildAvailabilityCheckInput): Promise<SeededAvailabilityCheck> {
  return requireInsertedRow({
    rows: await db
      .insert(availabilityCheck)
      .values({ id, churchId, cycleId, ministryMembershipId, state })
      .returning(),
    description: `Availability Check for ${ministryMembershipId}`,
  });
}
