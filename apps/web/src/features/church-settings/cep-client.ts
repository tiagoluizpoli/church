/** The fields a CEP fills in the address dialog; the same ones manual entry edits. */
export interface CepAddress {
  cep: string;
  street: string;
  bairro: string;
  city: string;
  uf: string;
  /** Only when the provider knows where the CEP is (BrasilAPI v2 does for many). */
  latitude?: number;
  longitude?: number;
}

/** Both providers failed (network or server error); the CEP may still exist. */
export class CepLookupFailed extends Error {
  constructor() {
    super('CEP lookup failed at every provider');
  }
}

const CEP_DIGITS = 8;

/** The 8 digits of a typed CEP (`13.015-904`, `13015904`), or `null` when it is not a CEP. */
export function normalizeCep(value: string): string | null {
  const digits = value.replace(/[.\-\s]/g, '');
  return new RegExp(`^\\d{${CEP_DIGITS}}$`).test(digits) ? digits : null;
}

interface ViaCepResponse {
  erro?: boolean | string;
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

interface BrasilApiResponse {
  cep?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  location?: { coordinates?: { latitude?: string; longitude?: string } };
}

interface ProviderInput {
  cep: string;
  signal?: AbortSignal;
}

interface GetJsonInput {
  url: string;
  signal?: AbortSignal;
}

async function getJson({ url, signal }: GetJsonInput) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

/** ViaCEP answers 200 with `{ "erro": true }` for a CEP it does not know. */
interface FromViaCepInput {
  data: ViaCepResponse;
}

export function fromViaCep({ data }: FromViaCepInput) {
  if (data.erro) return null;
  return {
    cep: data.cep?.replace(/\D/g, '') ?? '',
    street: data.logradouro ?? '',
    bairro: data.bairro ?? '',
    city: data.localidade ?? '',
    uf: data.uf ?? '',
  } satisfies CepAddress;
}

interface FromBrasilApiInput {
  data: BrasilApiResponse;
}

export function fromBrasilApi({ data }: FromBrasilApiInput) {
  const latitude = Number(data.location?.coordinates?.latitude);
  const longitude = Number(data.location?.coordinates?.longitude);
  const located =
    data.location?.coordinates?.latitude !== undefined &&
    data.location.coordinates.longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  return {
    ...(located ? { latitude, longitude } : {}),
    cep: data.cep?.replace(/\D/g, '') ?? '',
    street: data.street ?? '',
    bairro: data.neighborhood ?? '',
    city: data.city ?? '',
    uf: data.state ?? '',
  } satisfies CepAddress;
}

async function viaCep({ cep, signal }: ProviderInput) {
  const data = await getJson({
    url: `https://viacep.com.br/ws/${cep}/json/`,
    signal,
  });
  return fromViaCep({ data });
}

/** BrasilAPI answers 404 for an unknown CEP, which is a failure here: it only backs ViaCEP up. */
async function brasilApi({ cep, signal }: ProviderInput) {
  const data = await getJson({
    url: `https://brasilapi.com.br/api/cep/v2/${cep}`,
    signal,
  });
  return fromBrasilApi({ data });
}

/**
 * Looks a normalised CEP up in the browser: ViaCEP first, BrasilAPI when it fails.
 * Resolves `null` for a CEP ViaCEP does not know; throws `CepLookupFailed` when both providers fail.
 */
export async function lookupCep({
  cep,
  signal,
}: ProviderInput): Promise<CepAddress | null> {
  try {
    return await viaCep({ cep, signal });
  } catch {
    try {
      return await brasilApi({ cep, signal });
    } catch {
      throw new CepLookupFailed();
    }
  }
}
