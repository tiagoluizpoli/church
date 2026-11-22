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

/** One Social Link being edited; the network is never stored, it is detected from the URL. */
export interface SocialLinkDraft {
  key: string;
  url: string;
  /** Empty means no description. */
  description: string;
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
  /** In display order; the server owns the rules on which is main. */
  addresses: AddressDraft[];
  /** In display order; always public. */
  socialLinks: SocialLinkDraft[];
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
    | 'socialLinks'
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
    addresses: settings.addresses.map(
      ({ id, country: _country, ...address }) => ({
        ...address,
        id,
        key: id,
      }),
    ),
    socialLinks: settings.socialLinks.map(({ url, description }, index) => ({
      key: `saved-${index}`,
      url,
      description: description ?? '',
    })),
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
  const { slug, ...rest } = form;
  return {
    ...rest,
    ...(slugChanged ? { slug: slug.trim() } : {}),
    addresses: form.addresses.map(({ key: _key, ...address }) => address),
    socialLinks: form.socialLinks.map(({ key: _key, ...link }) => link),
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
