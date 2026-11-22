import type { Instant } from '@church/time';
import { z } from 'zod';

export const BRAZILIAN_UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;
export const PIN_SOURCES = ['google', 'cep', 'admin'] as const;
export type PinSource = (typeof PIN_SOURCES)[number];

/** Stored in the number column when the place has no number (*Sem número*). */
export const NO_NUMBER = 's/n';
export const CHURCH_ADDRESS_MAX = 50;

/** A Church Address as stored. Empty optional fields are `null`; the country is always Brazil. */
export interface ChurchAddress {
  id: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  bairro: string;
  city: string;
  uf: (typeof BRAZILIAN_UFS)[number];
  cep: string | null;
  country: 'BR';
  isPublic: boolean;
  isMain: boolean;
  latitude: number | null;
  longitude: number | null;
  pinSource: PinSource | null;
  placeId: string | null;
}

/** One address of a save: `id` names a stored address to keep, null/absent adds one. List order is the display order. */
export type ChurchAddressChange = Omit<ChurchAddress, 'id'> & {
  id: string | null;
};

export const CHURCH_ADDRESS_FIELD_CODES = [
  'ADDRESS_REQUIRED',
  'ADDRESS_TOO_LONG',
  'ADDRESS_UF_INVALID',
  'ADDRESS_CEP_INVALID',
  'ADDRESS_PIN_INVALID',
  'ADDRESS_MAIN_MULTIPLE',
  'ADDRESS_MAIN_REQUIRED',
  'ADDRESS_REPLACEMENT_REQUIRED',
] as const;
export type ChurchAddressFieldCode =
  (typeof CHURCH_ADDRESS_FIELD_CODES)[number];

function requiredText(max: number) {
  return z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, 'ADDRESS_REQUIRED').max(max, 'ADDRESS_TOO_LONG'));
}

function optionalText(max: number) {
  return z
    .string()
    .nullish()
    .transform((value) => value?.trim().replace(/\s+/g, ' ') || null)
    .pipe(z.string().max(max, 'ADDRESS_TOO_LONG').nullable());
}

/** 8 digits, a hyphen after the fifth allowed; stored as digits only. */
const cepSchema = z
  .string()
  .nullish()
  .transform((value, context) => {
    const trimmed = value?.trim() ?? '';
    if (trimmed === '') return null;
    if (!/^\d{5}-?\d{3}$/.test(trimmed)) {
      context.addIssue({ code: 'custom', message: 'ADDRESS_CEP_INVALID' });
      return z.NEVER;
    }
    return trimmed.replace('-', '');
  });

const churchAddressChangeSchema = z
  .object({
    id: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
    label: optionalText(60),
    street: requiredText(120),
    number: requiredText(20),
    complement: optionalText(60),
    bairro: requiredText(80),
    city: requiredText(80),
    uf: z.enum(BRAZILIAN_UFS, 'ADDRESS_UF_INVALID'),
    cep: cepSchema,
    country: z.literal('BR').default('BR'),
    isPublic: z.boolean().default(true),
    isMain: z.boolean().default(false),
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .nullish()
      .transform((v) => v ?? null),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .nullish()
      .transform((v) => v ?? null),
    pinSource: z
      .enum(PIN_SOURCES)
      .nullish()
      .transform((v) => v ?? null),
    placeId: optionalText(300),
  })
  .superRefine((address, context) => {
    const parts = [address.latitude, address.longitude, address.pinSource];
    if (
      parts.some((part) => part === null) &&
      parts.some((part) => part !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'ADDRESS_PIN_INVALID',
      });
    }
  });

/** The Church's addresses in display order; at most one is the Main Address. */
export const churchAddressesSchema = z
  .array(churchAddressChangeSchema)
  .max(CHURCH_ADDRESS_MAX)
  .superRefine((addresses, context) => {
    if (addresses.filter((address) => address.isMain).length > 1) {
      context.addIssue({ code: 'custom', message: 'ADDRESS_MAIN_MULTIPLE' });
    }
  });

/** Where the references of a deleted address go: another address, or `null` for no place. */
export interface AddressReplacement {
  addressId: string;
  replacementAddressId: string | null;
}

export const addressReplacementsSchema = z
  .array(
    z.object({
      addressId: z.uuid(),
      replacementAddressId: z.uuid().nullable(),
    }),
  )
  .max(CHURCH_ADDRESS_MAX)
  .optional();

/** What still points at a Church Address: templates and upcoming Public Events. */
export interface ChurchAddressUsage {
  templates: { id: string; name: string }[];
  events: { id: string; title: string; start: Instant }[];
}

export interface ChurchAddressRefusal {
  field: string;
  code: ChurchAddressFieldCode | 'INVALID';
}

interface ChurchAddressesRefusedInput {
  refusals: ChurchAddressRefusal[];
}

/** A save the stored addresses make invalid; the controller answers it as a 422 per field. */
export class ChurchAddressesRefused extends Error {
  readonly refusals: ChurchAddressRefusal[];
  constructor({ refusals }: ChurchAddressesRefusedInput) {
    super('Church addresses refused');
    this.refusals = refusals;
  }
}

export interface ChurchAddressWrite extends ChurchAddressChange {
  position: number;
}

interface ResolveInput {
  stored: readonly ChurchAddress[];
  incoming: readonly ChurchAddressChange[];
}

/**
 * Applies the save rules the payload alone cannot know: an id must be a stored
 * address of this Church; the first address a Church gets becomes its Main
 * Address; later the payload must name one (so the Main Address cannot be
 * dropped while others remain); and a `place_id` the admin did not re-pick is
 * dropped once street, number or city differ from what was picked.
 */
export function resolveChurchAddresses({
  stored,
  incoming,
}: ResolveInput): ChurchAddressWrite[] {
  const byId = new Map(stored.map((address) => [address.id, address]));
  const seen = new Set<string>();
  const refusals: ChurchAddressRefusal[] = [];
  const writes = incoming.map((address, position): ChurchAddressWrite => {
    const previous = address.id ? byId.get(address.id) : undefined;
    if (address.id && (!previous || seen.has(address.id))) {
      refusals.push({ field: `addresses.${position}.id`, code: 'INVALID' });
    }
    if (address.id) seen.add(address.id);
    const stale =
      previous !== undefined &&
      previous.placeId !== null &&
      previous.placeId === address.placeId &&
      (previous.street !== address.street ||
        previous.number !== address.number ||
        previous.city !== address.city);
    return { ...address, placeId: stale ? null : address.placeId, position };
  });
  if (writes.length > 0 && !writes.some((address) => address.isMain)) {
    if (stored.length === 0) {
      writes[0] = { ...(writes[0] as ChurchAddressWrite), isMain: true };
    } else {
      refusals.push({ field: 'addresses', code: 'ADDRESS_MAIN_REQUIRED' });
    }
  }
  if (refusals.length > 0) throw new ChurchAddressesRefused({ refusals });
  return writes;
}

/** The allow-listed fields of a public Church Address. */
export type PublicChurchAddress = Pick<
  ChurchAddress,
  | 'label'
  | 'street'
  | 'number'
  | 'complement'
  | 'bairro'
  | 'city'
  | 'uf'
  | 'cep'
  | 'latitude'
  | 'longitude'
  | 'placeId'
  | 'isMain'
>;

export type MainAddressArea = Pick<ChurchAddress, 'bairro' | 'city' | 'uf'>;

export interface PublicChurchAddresses {
  addresses: PublicChurchAddress[];
  /** `null` when the Church has no Main Address. */
  mainAddressArea: MainAddressArea | null;
}
