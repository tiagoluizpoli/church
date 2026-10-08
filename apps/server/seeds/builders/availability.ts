import { availability, availabilityCheck } from '@church/db';
import { type Instant, toDate } from '@church/time';
import type { SeedWriter } from '../recipe';
import { requireInsertedRow } from './require-inserted-row';

/**
 * Direct-state builders for a fired availability round: the check one
 * Ministry Membership answers per PlanningCycle, and the unavailability marks
 * hanging off it (a Volunteer is available unless marked).
 */

export type SeededAvailabilityCheck = typeof availabilityCheck.$inferSelect;
export type SeededUnavailabilityMark = typeof availability.$inferSelect;

export interface BuildConfirmedAvailabilityCheckInput {
  db: SeedWriter;
  churchId: string;
  planningCycleId: string;
  ministryVolunteerId: string;
  id: string;
  /** Explicit, so a graph never depends on the wall clock at load time. */
  confirmedAt: Instant;
}

/** A check the Volunteer has answered, with or without marks. */
export async function buildConfirmedAvailabilityCheck({
  db,
  churchId,
  planningCycleId,
  ministryVolunteerId,
  id,
  confirmedAt,
}: BuildConfirmedAvailabilityCheckInput): Promise<SeededAvailabilityCheck> {
  return requireInsertedRow({
    rows: await db
      .insert(availabilityCheck)
      .values({
        id,
        churchId,
        planningCycleId,
        ministryVolunteerId,
        state: 'confirmed',
        confirmedAt: toDate({ instant: confirmedAt }),
      })
      .returning(),
    description: `Availability Check ${id}`,
  });
}

export interface BuildUnavailabilityMarkInput {
  db: SeedWriter;
  churchId: string;
  availabilityCheckId: string;
  shiftId: string;
  id?: string;
}

/** The Volunteer cannot serve this Shift. */
export async function buildUnavailabilityMark({
  db,
  churchId,
  availabilityCheckId,
  shiftId,
  id,
}: BuildUnavailabilityMarkInput): Promise<SeededUnavailabilityMark> {
  return requireInsertedRow({
    rows: await db
      .insert(availability)
      .values({ id, churchId, availabilityCheckId, shiftId })
      .returning(),
    description: `Unavailability mark ${id}`,
  });
}

export type AvailabilityCheckState = SeededAvailabilityCheck['state'];

export interface BuildAvailabilityCheckInput {
  db: SeedWriter;
  churchId: string;
  planningCycleId: string;
  ministryVolunteerId: string;
  id?: string;
  /** Left to the column default (pending) when a fixture does not care. */
  state?: AvailabilityCheckState;
}

/** A Ministry Membership's Availability Check, not yet answered unless `state` says so. */
export async function buildAvailabilityCheck({
  db,
  churchId,
  planningCycleId,
  ministryVolunteerId,
  id,
  state,
}: BuildAvailabilityCheckInput): Promise<SeededAvailabilityCheck> {
  return requireInsertedRow({
    rows: await db
      .insert(availabilityCheck)
      .values({ id, churchId, planningCycleId, ministryVolunteerId, state })
      .returning(),
    description: `Availability Check for ${ministryVolunteerId}`,
  });
}
