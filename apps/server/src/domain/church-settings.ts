import { churchSlugRefusal } from '@church/domain-rules/church-slug';
import { z } from 'zod';
import {
  type AddressReplacement,
  CHURCH_ADDRESS_FIELD_CODES,
  type ChurchAddress,
  type ChurchAddressChange,
} from './church-address';
import type { ChurchContact } from './church-contact';
import {
  type ChurchLegalProfile,
  LEGAL_PROFILE_FIELD_CODES,
} from './church-legal-profile';
import {
  type ChurchSocialLink,
  SOCIAL_LINK_FIELD_CODES,
  type SocialLinkChange,
} from './social-link';

/** Church Settings as stored; empty optional fields are `null`. */
export interface ChurchSettings {
  name: string;
  slug: string;
  website: string | null;
  accentColor: string | null;
  addresses: ChurchAddress[];
  /** In display order; always public. */
  socialLinks: ChurchSocialLink[];
  /** `null` when the Church has recorded none. */
  legalProfile: ChurchLegalProfile | null;
  /** Object-storage key of the logo; `null` when the Church has none. */
  logoKey: string | null;
  /** In the admin's order. */
  contacts: ChurchContact[];
  /** Contact Group names in display order; "Da igreja" (ungrouped) is always first and not listed. */
  contactGroups: string[];
}

export interface ChurchSettingsChanges {
  name: string;
  /** Omitted, the slug stays; renaming the Church never changes it. */
  slug?: string;
  website: string | null;
  accentColor: string | null;
  /** The whole list replaces the stored contacts. */
  contacts: ChurchContact[];
  /** The order of the groups. Unlisted groups follow, a group with no member is deleted. */
  contactGroups: string[];
  addresses: ChurchAddressChange[];
  /** Omitted, none: deleting an address that is in use is refused. */
  addressReplacements?: AddressReplacement[];
  socialLinks: SocialLinkChange[];
  legalProfile: ChurchLegalProfile | null;
}

/**
 * Church Settings value objects. Each refusal's message is a stable code the
 * HTTP layer words per field (see `CHURCH_SETTINGS_FIELD_CODES`).
 */
export const CHURCH_SETTINGS_FIELD_CODES = [
  'CHURCH_NAME_LENGTH',
  'CHURCH_WEBSITE_HTTPS_ONLY',
  'CHURCH_WEBSITE_INVALID',
  'CHURCH_WEBSITE_TOO_LONG',
  'ACCENT_COLOR_INVALID',
  ...CHURCH_ADDRESS_FIELD_CODES,
  ...SOCIAL_LINK_FIELD_CODES,
  ...LEGAL_PROFILE_FIELD_CODES,
  'CHURCH_SLUG_LENGTH',
  'CHURCH_SLUG_FORMAT',
  'CHURCH_SLUG_RESERVED',
  'CHURCH_SLUG_TAKEN',
  'CONTACT_PHONE_INVALID',
  'CONTACT_EMAIL_INVALID',
  'CONTACT_DESCRIPTION_TOO_LONG',
  'CONTACT_GROUP_TOO_LONG',
  'INVALID',
] as const;
export type ChurchSettingsFieldCode =
  (typeof CHURCH_SETTINGS_FIELD_CODES)[number];

export const CHURCH_NAME_MIN = 2;
export const CHURCH_NAME_MAX = 80;
export const CHURCH_WEBSITE_MAX = 2048;
export const ACCENT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** The only required field: trimmed, inner whitespace collapsed, 2–80 characters. */
export const churchNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(CHURCH_NAME_MIN, 'CHURCH_NAME_LENGTH')
      .max(CHURCH_NAME_MAX, 'CHURCH_NAME_LENGTH'),
  );

/** Format, length and reserved words (shared with the web); uniqueness needs the database. */
export const churchSlugSchema = z
  .string()
  .trim()
  .superRefine((slug, context) => {
    const refusal = churchSlugRefusal(slug);
    if (refusal) {
      context.addIssue({ code: 'custom', message: `CHURCH_SLUG_${refusal}` });
    }
  });

/** What a Church can do with a Church Slug it asks for, as seen from that Church. */
export type ChurchSlugAvailability =
  | 'free'
  | 'taken'
  | 'reserved'
  | 'invalid'
  | 'own_history';

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function hasValidHost(value: string): boolean {
  if (/\s/.test(value) || !URL.canParse(value)) {
    return false;
  }
  return new URL(value).hostname.includes('.');
}

/** `https://` only; a bare domain gets it prepended; empty means no website. */
export const churchWebsiteSchema = z
  .string()
  .nullable()
  .transform((value, context) => {
    const trimmed = value?.trim() ?? '';
    if (trimmed === '') {
      return null;
    }
    const url = SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
    const code = websiteRefusal(url);
    if (code) {
      context.addIssue({ code: 'custom', message: code });
      return z.NEVER;
    }
    return url;
  });

function websiteRefusal(url: string): ChurchSettingsFieldCode | undefined {
  if (!url.toLowerCase().startsWith('https://')) {
    return 'CHURCH_WEBSITE_HTTPS_ONLY';
  }
  if (url.length > CHURCH_WEBSITE_MAX) {
    return 'CHURCH_WEBSITE_TOO_LONG';
  }
  return hasValidHost(url) ? undefined : 'CHURCH_WEBSITE_INVALID';
}

/** `#rrggbb` (stored lowercase), or null for "Padrão do app". */
export const accentColorSchema = z
  .string()
  .regex(ACCENT_COLOR_PATTERN, 'ACCENT_COLOR_INVALID')
  .transform((value) => value.toLowerCase())
  .nullable();

export const ACCENT_TEXT_LIGHT = '#ffffff';
export const ACCENT_TEXT_DARK = '#111111';

interface AccentTextColorInput {
  accentColor: string;
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** White or near-black text on the accent, whichever contrasts more (WCAG relative luminance). */
export function accentTextColor({
  accentColor,
}: AccentTextColorInput): typeof ACCENT_TEXT_LIGHT | typeof ACCENT_TEXT_DARK {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    channelLuminance(Number.parseInt(accentColor.slice(start, start + 2), 16)),
  ) as [number, number, number];
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const againstWhite = 1.05 / (luminance + 0.05);
  const againstBlack = (luminance + 0.05) / 0.05;
  return againstWhite >= againstBlack ? ACCENT_TEXT_LIGHT : ACCENT_TEXT_DARK;
}
