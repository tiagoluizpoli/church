import { vi } from 'vitest';
import type { GetActiveChurchStatus200 } from '@/infrastructure/api/churchAPI.schemas';

interface ResolvedStatusDiscriminant {
  status: 'resolved';
}

/** The entry gate's resolved status — what both the status and select calls return once a Church is Active. */
export type ResolvedActiveChurchStatus = Extract<
  GetActiveChurchStatus200,
  ResolvedStatusDiscriminant
>;

export const DEFAULT_CHURCH_ID = 'church-1';
export const DEFAULT_CHURCH_TIMEZONE = 'UTC';

export interface ResolvedActiveChurchStatusInput {
  churchId?: string;
  /** IANA Church Timezone of the resolved Church. */
  timezone?: string;
  membershipRemovedFrom?: string;
}

/**
 * Builds a resolved Active Church status that honours the real contract: it
 * always carries a Church Timezone. A test proving the route rejects a status
 * without one writes that broken object by hand instead.
 */
export function resolvedActiveChurchStatus({
  churchId = DEFAULT_CHURCH_ID,
  timezone = DEFAULT_CHURCH_TIMEZONE,
  membershipRemovedFrom,
}: ResolvedActiveChurchStatusInput = {}): ResolvedActiveChurchStatus {
  return { status: 'resolved', churchId, timezone, membershipRemovedFrom };
}

/**
 * One shared stand-in for `activeChurchApi`. A route test wires it in with
 *
 *   vi.mock('@/utils/api-instances', async () => {
 *     const { activeChurchApiMock } = await import('@/__tests__/setup/active-church');
 *     return { activeChurchApi: activeChurchApiMock };
 *   });
 *
 * so `renderRoute({ churchTimezone })` can seed the entry gate it reads.
 */
export const activeChurchApiMock = {
  getActiveChurchStatus: vi.fn(),
  listActiveChurchOptions: vi.fn(),
  selectActiveChurch: vi.fn(),
};
