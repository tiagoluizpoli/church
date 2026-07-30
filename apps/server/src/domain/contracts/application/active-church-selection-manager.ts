import type { ChurchAccessLevel } from '../../authority/types';
import type { ChurchId, UserId } from '../../branded-ids';
import type { ActiveChurchResolution } from './active-church-resolver';

/** An application surface the caller may reach once that Church is Active — mirrors the nav-visibility signal `useCallerRoles` derives client-side, computed here per candidate Church instead of only the current one. */
export const APPLICATION_AREA_OPTIONS = ['dashboard', 'scheduling'] as const;
export type ApplicationArea = (typeof APPLICATION_AREA_OPTIONS)[number];

/** One Church Membership as the compare-access selector needs to present it (spec.md §1.5). */
export interface ChurchSelectionOption {
  churchId: ChurchId;
  name: string;
  timezone: string;
  accessLevel: ChurchAccessLevel;
  availableAreas: ApplicationArea[];
  lastOpenedAt: Date | null;
}

export interface ListSelectableChurchesInput {
  userId: UserId;
}

export interface SelectActiveChurchInput {
  userId: UserId;
  churchId: ChurchId;
}

/**
 * Read and write sides of the compare-access selector (spec.md §1.5): lists
 * every Church Membership a User can choose between, and records an explicit
 * choice. Entry-gate resolution itself (auto-select, "selection required",
 * "no membership") stays `IActiveChurchResolver`'s job — this composes it for
 * the one write path unique to an explicit pick.
 */
export interface IActiveChurchSelectionManager {
  listSelectableChurches(
    input: ListSelectableChurchesInput,
  ): Promise<ChurchSelectionOption[]>;
  /** Revalidates membership against `churchId` and, once resolved, records the Church as just-opened. Does not persist onto the session — the API boundary owns that. */
  selectActiveChurch(
    input: SelectActiveChurchInput,
  ): Promise<ActiveChurchResolution>;
}
