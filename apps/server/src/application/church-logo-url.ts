import type { ChurchLogoUrlInput } from '../domain/contracts/application/church-logo-url';

/** The public URL of a Church's logo; null without one. */
export function churchLogoUrl({
  objectStorage,
  logoKey,
}: ChurchLogoUrlInput): string | null {
  return logoKey ? objectStorage.publicUrl({ key: logoKey }) : null;
}
