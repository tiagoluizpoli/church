/** The Church identity an email is stamped with when it is queued. */
export interface ChurchIdentitySnapshot {
  /** Absolute public URL of the Church's logo; null without a logo. */
  churchLogoUrl: string | null;
  /** `#rrggbb`; null without an accent. */
  churchAccent: string | null;
  /** The Main Address's "bairro, city/UF"; absent without an address. */
  churchLocality?: string;
}
