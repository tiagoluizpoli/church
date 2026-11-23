import { groupOrder } from '@/features/church-settings/contact-groups';
import type {
  GetChurchSettings200,
  UpdateChurchSettingsBody,
} from '@/infrastructure/api/churchAPI.schemas';

type AddressBody = UpdateChurchSettingsBody['addresses'][number];

/** Where the references of a deleted saved address go: another address, or `null` for no place. */
export type AddressReplacement = NonNullable<
  UpdateChurchSettingsBody['addressReplacements']
>[number];

/** One Church Address being edited; `key` is the row's stable React key (its id once saved). */
export type AddressDraft = Required<Omit<AddressBody, 'country' | 'id'>> & {
  key: string;
  id: string | null;
};

export type ContactType = 'mobile' | 'landline' | 'email';

/** One Church Contact row as edited; `key` only identifies the row in the list. */
export interface ContactForm {
  key: string;
  type: ContactType;
  value: string;
  description: string;
  isWhatsApp: boolean;
  isPublic: boolean;
  /** *Pessoa ou ministério*; empty means "Da igreja". */
  group: string;
}

type SavedContact = GetChurchSettings200['contacts'][number];

interface ToContactFormInput {
  contact: SavedContact;
  index: number;
}

function toContactForm({ contact, index }: ToContactFormInput): ContactForm {
  const { kind, phoneType, value, description, isWhatsApp, isPublic, group } =
    contact;
  return {
    key: `saved-${index}`,
    type: kind === 'email' ? 'email' : (phoneType ?? 'mobile'),
    value,
    description: description ?? '',
    isWhatsApp,
    isPublic,
    group: group ?? '',
  };
}

interface ToContactBodyInput {
  contact: ContactForm;
}

/** The request row of an edited contact. */
export function toContactBody({ contact }: ToContactBodyInput) {
  const { type, value, description, isWhatsApp, isPublic, group } = contact;
  const isEmail = type === 'email';
  return {
    kind: isEmail ? ('email' as const) : ('phone' as const),
    phoneType: isEmail ? null : type,
    value,
    description: description || null,
    isWhatsApp: !isEmail && isWhatsApp,
    isPublic,
    group: group.trim() || null,
  };
}

/** One Social Link being edited; the network is never stored, it is detected from the URL. */
export interface SocialLinkDraft {
  key: string;
  url: string;
  /** Empty means no description. */
  description: string;
  /** *Pessoa ou ministério*; empty means "Da igreja". */
  group: string;
}

/** The Church Legal Profile being edited; both text fields empty means none. */
export interface LegalProfileDraft {
  legalName: string;
  /** Typed with or without the mask; the server stores its 14 digits. */
  cnpj: string;
  isPublic: boolean;
}

/** What the screen edits; the server normalises it on save. */
export interface ChurchSettingsForm {
  name: string;
  slug: string;
  /** Empty means no website. */
  website: string;
  /** `null` means "Padrão do app". */
  accentColor: string | null;
  /** In display order. */
  contacts: ContactForm[];
  /** In display order; the server owns the rules on which is main. */
  addresses: AddressDraft[];
  /** Deleted saved addresses still in use, each with its chosen replacement. */
  addressReplacements: AddressReplacement[];
  /** In display order; always public. */
  socialLinks: SocialLinkDraft[];
  /** The saved order of the Contact Groups; the effective order is `groupOrder`. */
  contactGroups: string[];
  legalProfile: LegalProfileDraft;
}

interface ToChurchSettingsFormInput {
  settings: Pick<
    GetChurchSettings200,
    | 'name'
    | 'slug'
    | 'website'
    | 'accentColor'
    | 'addresses'
    | 'contacts'
    | 'socialLinks'
    | 'contactGroups'
    | 'legalProfile'
  >;
}

export function toChurchSettingsForm({
  settings,
}: ToChurchSettingsFormInput): ChurchSettingsForm {
  return {
    name: settings.name,
    slug: settings.slug,
    website: settings.website ?? '',
    accentColor: settings.accentColor,
    addressReplacements: [],
    addresses: settings.addresses.map(
      ({ id, country: _country, ...address }) => ({
        ...address,
        id,
        key: id,
      }),
    ),
    contacts: settings.contacts.map((contact, index) =>
      toContactForm({ contact, index }),
    ),
    socialLinks: settings.socialLinks.map(
      ({ url, description, group }, index) => ({
        key: `saved-${index}`,
        url,
        description: description ?? '',
        group: group ?? '',
      }),
    ),
    contactGroups: settings.contactGroups,
    legalProfile: settings.legalProfile
      ? {
          ...settings.legalProfile,
          cnpj: formatCnpj({ digits: settings.legalProfile.cnpj }),
        }
      : { legalName: '', cnpj: '', isPublic: false },
  };
}

interface FormatCnpjInput {
  digits: string;
}

/** `11222333000181` as `11.222.333/0001-81`. */
export function formatCnpj({ digits }: FormatCnpjInput): string {
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5',
  );
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

interface PaintableAccentInput {
  value: string | null;
}

/** The typed accent when it is a complete `#rrggbb`, safe to paint with; otherwise `null`. */
export function paintableAccent({
  value,
}: PaintableAccentInput): string | null {
  return value !== null && HEX_COLOR.test(value) ? value : null;
}

interface ToSaveBodyInput {
  form: ChurchSettingsForm;
  /** Sent only when the slug changed; omitted, the slug stays. */
  slugChanged: boolean;
}

/** The PUT body: the draft rows without their React keys. */
export function toSaveBody({
  form,
  slugChanged,
}: ToSaveBodyInput): UpdateChurchSettingsBody {
  const {
    slug,
    addresses,
    addressReplacements,
    contacts,
    socialLinks,
    contactGroups: _saved,
    ...rest
  } = form;
  return {
    ...rest,
    ...(slugChanged ? { slug: slug.trim() } : {}),
    addresses: addresses.map(({ key: _key, ...address }) => address),
    ...(addressReplacements.length > 0 ? { addressReplacements } : {}),
    contacts: contacts.map((contact) => toContactBody({ contact })),
    socialLinks: socialLinks.map(({ key: _key, group, ...link }) => ({
      ...link,
      group: group.trim() || null,
    })),
    contactGroups: groupOrder({ form }),
  };
}

/** `Rua A, 120 · Centro · Campinas/SP`, one line. */
interface AddressSummaryInput {
  address: Pick<
    AddressDraft,
    'street' | 'number' | 'complement' | 'bairro' | 'city' | 'uf'
  >;
}

export function addressSummary({ address }: AddressSummaryInput): string {
  const line = [address.street, address.number].join(', ');
  const complement = address.complement ? ` – ${address.complement}` : '';
  return `${line}${complement} · ${address.bairro} · ${address.city}/${address.uf}`;
}

interface ClearEditedErrorsInput {
  errors: Readonly<Record<string, string>>;
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * The errors left once `field` changed from `before` to `after`: a list keeps
 * the errors of rows that did not change; a row added, removed or a non-list
 * value clears every error of the field (rows would shift under them).
 */
export function clearEditedErrors({
  errors,
  field,
  before,
  after,
}: ClearEditedErrorsInput): Record<string, string> {
  const sameLength =
    Array.isArray(before) &&
    Array.isArray(after) &&
    before.length === after.length;
  const changedRows = sameLength
    ? after.flatMap((row, index) =>
        JSON.stringify(row) === JSON.stringify(before[index]) ? [] : [index],
      )
    : [];
  const cleared = (key: string) => {
    if (key === field) return true;
    if (!key.startsWith(`${field}.`)) return false;
    if (!sameLength) return true;
    const row = Number(key.slice(field.length + 1).split('.')[0]);
    return changedRows.includes(row);
  };
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) => !cleared(key)),
  );
}
