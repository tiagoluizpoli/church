import type { ObjectStorage } from '../domain/contracts/infrastructure/object-storage';

export interface ChurchLogoUrlInput {
  objectStorage: Pick<ObjectStorage, 'publicUrl'>;
  logoKey: string | null;
}

/** The public URL of a Church's logo; null without one. */
export function churchLogoUrl({
  objectStorage,
  logoKey,
}: ChurchLogoUrlInput): string | null {
  return logoKey ? objectStorage.publicUrl({ key: logoKey }) : null;
}
