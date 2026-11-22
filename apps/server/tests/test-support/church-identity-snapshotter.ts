import type { ChurchIdentitySnapshotter } from '@/domain/contracts/application/church-identity-snapshotter';

/** A Church with no logo and no accent: snapshots both as null. */
export const nullChurchIdentity: ChurchIdentitySnapshotter = {
  snapshot: async () => ({ churchLogoUrl: null, churchAccent: null }),
};
