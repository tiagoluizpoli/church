import type { ChurchId } from '../../branded-ids';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';

/** The Church identity an email is stamped with when it is queued. */
export interface ChurchIdentitySnapshot {
  /** Absolute public URL of the Church's logo; null without a logo. */
  churchLogoUrl: string | null;
  /** `#rrggbb`; null without an accent. */
  churchAccent: string | null;
}

export interface SnapshotChurchIdentityInput {
  churchId: ChurchId;
  /** The caller's open transaction; the read joins it. */
  tx?: TransactionContext;
}

export interface ChurchIdentitySnapshotter {
  /** Reads the Church's current logo and accent, for the caller to freeze into a payload. */
  snapshot(input: SnapshotChurchIdentityInput): Promise<ChurchIdentitySnapshot>;
}
