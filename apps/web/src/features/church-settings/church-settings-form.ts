import type { GetChurchSettings200 } from '@/infrastructure/api/churchAPI.schemas';

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
}

interface ToChurchSettingsFormInput {
  settings: Pick<
    GetChurchSettings200,
    'name' | 'slug' | 'website' | 'accentColor' | 'contacts'
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
    contacts: settings.contacts.map((contact, index) =>
      toContactForm({ contact, index }),
    ),
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
