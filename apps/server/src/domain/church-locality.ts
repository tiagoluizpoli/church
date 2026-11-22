export interface ChurchLocalityAddress {
  bairro: string;
  city: string;
  uf: string;
}

/**
 * The muted text that tells same-named Churches apart: the Main Address's
 * "bairro, city/UF". Privacy does not apply: a private Main Address still
 * shows it. A Church without an address shows nothing.
 */
export function formatChurchLocality(
  mainAddress: ChurchLocalityAddress | null | undefined,
): string | null {
  if (!mainAddress) return null;
  const { bairro, city, uf } = mainAddress;
  return `${bairro}, ${city}/${uf}`;
}
