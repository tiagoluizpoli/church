import type { ChurchId } from '../../branded-ids';

/** The Church identity an email is stamped with when it is queued. */
export interface ChurchIdentitySnapshot {
  /** Absolute public URL of the Church's logo; null without a logo. */
  churchLogoUrl: string | null;
  /** `#rrggbb`; null without an accent. */
  churchAccent: string | null;
}

export interface SnapshotChurchIdentityInput {
  churchId: ChurchId;
}

export interface ChurchIdentitySnapshotter {
  /** Reads the Church's current logo and accent, for the caller to freeze into a payload. */
  snapshot(input: SnapshotChurchIdentityInput): Promise<ChurchIdentitySnapshot>;
}
