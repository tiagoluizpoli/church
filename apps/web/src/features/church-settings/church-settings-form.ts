import type {
  GetChurchSettings200,
  UpdateChurchSettingsBody,
} from '@/infrastructure/api/churchAPI.schemas';

type AddressBody = UpdateChurchSettingsBody['addresses'][number];

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
}

type SavedContact = GetChurchSettings200['contacts'][number];

interface ToContactFormInput {
  contact: SavedContact;
  index: number;
}

function toContactForm({ contact, index }: ToContactFormInput): ContactForm {
  const { kind, phoneType, value, description, isWhatsApp, isPublic } = contact;
  return {
    key: `saved-${index}`,
    type: kind === 'email' ? 'email' : (phoneType ?? 'mobile'),
    value,
    description: description ?? '',
    isWhatsApp,
    isPublic,
  };
}

interface ToContactBodyInput {
  contact: ContactForm;
}

/** The request row of an edited contact. */
export function toContactBody({ contact }: ToContactBodyInput) {
  const { type, value, description, isWhatsApp, isPublic } = contact;
  const isEmail = type === 'email';
  return {
    kind: isEmail ? ('email' as const) : ('phone' as const),
    phoneType: isEmail ? null : type,
    value,
    description: description || null,
    isWhatsApp: !isEmail && isWhatsApp,
    isPublic,
  };
}

/** One Social Link being edited; the network is never stored, it is detected from the URL. */
export interface SocialLinkDraft {
  key: string;
  url: string;
  /** Empty means no description. */
  description: string;
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
  /** In display order; always public. */
  socialLinks: SocialLinkDraft[];
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
    socialLinks: settings.socialLinks.map(({ url, description }, index) => ({
      key: `saved-${index}`,
      url,
      description: description ?? '',
    })),
  };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

interface IsHexColorInput {
  value: string | null;
}

/** The typed accent when it is a complete `#rrggbb`, safe to paint with; otherwise `null`. */
export function paintableAccent({ value }: IsHexColorInput): string | null {
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
  const { slug, addresses, contacts, socialLinks, ...rest } = form;
  return {
    ...rest,
    ...(slugChanged ? { slug: slug.trim() } : {}),
    addresses: addresses.map(({ key: _key, ...address }) => address),
    contacts: contacts.map((contact) => toContactBody({ contact })),
    socialLinks: socialLinks.map(({ key: _key, ...link }) => link),
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
