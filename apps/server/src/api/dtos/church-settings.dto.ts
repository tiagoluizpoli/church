import { SOCIAL_NETWORK_KEYS } from '@church/domain-rules/social-networks';
import { m } from '@church/i18n/messages';
import type { Locale } from '@church/i18n/runtime';
import { z } from 'zod';
import {
  addressReplacementsSchema,
  BRAZILIAN_UFS,
  type ChurchAddressRefusal,
  churchAddressesSchema,
  PIN_SOURCES,
} from '../../domain/church-address';
import {
  CHURCH_CONTACT_KINDS,
  CHURCH_CONTACT_PHONE_TYPES,
  CONTACTS_MAX,
  churchContactSchema,
} from '../../domain/church-contact';
import { legalProfileSchema } from '../../domain/church-legal-profile';
import {
  accentColorSchema,
  CHURCH_SETTINGS_FIELD_CODES,
  type ChurchSettingsFieldCode,
  churchNameSchema,
  churchSlugSchema,
  churchWebsiteSchema,
} from '../../domain/church-settings';
import { contactGroupOrderSchema } from '../../domain/contact-group';
import { socialLinksSchema } from '../../domain/social-link';
import type { ErrorMessage } from '../utils/error-table';

const churchContactResponseSchema = z.object({
  kind: z.enum(CHURCH_CONTACT_KINDS),
  phoneType: z.enum(CHURCH_CONTACT_PHONE_TYPES).nullable(),
  value: z.string(),
  description: z.string().nullable(),
  isWhatsApp: z.boolean(),
  isPublic: z.boolean(),
  group: z.string().nullable(),
});

const churchAddressResponseSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable(),
  bairro: z.string(),
  city: z.string(),
  uf: z.enum(BRAZILIAN_UFS),
  cep: z.string().nullable(),
  country: z.literal('BR'),
  isPublic: z.boolean(),
  isMain: z.boolean(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  pinSource: z.enum(PIN_SOURCES).nullable(),
  placeId: z.string().nullable(),
});

const socialLinkResponseSchema = z.object({
  url: z.string(),
  /** Detected from the URL on save. */
  network: z.enum(SOCIAL_NETWORK_KEYS),
  description: z.string().nullable(),
  group: z.string().nullable(),
});

const legalProfileResponseSchema = z.object({
  legalName: z.string(),
  /** The 14 digits, no mask. */
  cnpj: z.string(),
  isPublic: z.boolean(),
});

export const churchSettingsResponseSchema = z.object({
  name: z.string(),
  slug: z.string(),
  website: z.string().nullable(),
  accentColor: z.string().nullable(),
  addresses: z.array(churchAddressResponseSchema),
  socialLinks: z.array(socialLinkResponseSchema),
  legalProfile: legalProfileResponseSchema.nullable(),
  /** Object-storage key of the logo (re-applied by *Desfazer*). */
  logoKey: z.string().nullable(),
  /** Anonymous URL of the logo, built from its key. */
  logoUrl: z.string().nullable(),
  /** Church Contacts in the admin's order. */
  contacts: z.array(churchContactResponseSchema),
  /** Contact Group names in display order; ungrouped rows ("Da igreja") come first and are not listed. */
  contactGroups: z.array(z.string()),
  /** The web origin the public `…/slug` address is shown under. */
  publicOrigin: z.string(),
});

/** The whole set of Church Settings, validated by the domain value objects. */
export const updateChurchSettingsBodySchema = z.object({
  name: churchNameSchema.describe(
    'Required. Trimmed, inner spaces collapsed, 2–80 characters.',
  ),
  slug: churchSlugSchema
    .optional()
    .describe(
      'Church Slug: 3–63 characters, lower-case letters, digits and single hyphens, not reserved, not taken. Omitted, the slug stays.',
    ),
  website: churchWebsiteSchema.describe(
    'https:// only; a bare domain gets it prepended; empty or null clears it; at most 2048 characters.',
  ),
  accentColor: accentColorSchema.describe(
    '#rrggbb, or null for the app default.',
  ),
  contacts: z
    .array(churchContactSchema)
    .max(CONTACTS_MAX)
    .optional()
    .describe(
      'Church Contacts in order; phones validated as allowed-country numbers and stored as E.164, emails lower-cased. Omitted, the contacts stay; sent, the list replaces them. A refused row is reported by index, e.g. contacts.1.value.',
    ),
  contactGroups: contactGroupOrderSchema
    .optional()
    .describe(
      'Contact Group names in display order, for the `group` of contacts and links. A group is created by naming it on a row, case-insensitively one group; unlisted groups follow in first-use order; a group no row uses is deleted on save. Omitted, the stored order stays.',
    ),
  addresses: churchAddressesSchema.describe(
    'Every Church Address in display order; the whole list replaces the stored one. `id` keeps a stored address, null or absent adds one. At most one is the Main Address; the first address a Church gets becomes main, later the list must name one. Country is always BR; number is "s/n" without a number; a `placeId` is dropped when street, number or city change from the stored pick.',
  ),
  addressReplacements: addressReplacementsSchema.describe(
    'What replaces each deleted address that templates or upcoming public events still use: another kept address of the Church, or null for no place. Deleting such an address without an entry is refused (ADDRESS_REPLACEMENT_REQUIRED); the replacement is applied to every reference in the same save.',
  ),
  socialLinks: socialLinksSchema.describe(
    'Every Social Link in display order; the whole list replaces the stored one. Only `url` and `description` are sent: the network is detected from the URL. Supported: Instagram, YouTube, Facebook, TikTok, Spotify, X, Threads, Telegram, WhatsApp channel and group, LinkedIn, Apple Podcasts, Deezer and Kwai; a wa.me link is refused (add it as a Contact). Always public.',
  ),
  legalProfile: legalProfileSchema.describe(
    'The Church Legal Profile: `legalName` and `cnpj` (mask accepted, check digits validated; stored as 14 digits) and the `isPublic` toggle (visitors see it only when true). Both blank clears the profile; one without the other is refused on the blank one. A CNPJ another Church holds is refused with a generic CNPJ_TAKEN that never names that Church.',
  ),
});
export type UpdateChurchSettingsBody = z.output<
  typeof updateChurchSettingsBodySchema
>;

export const churchAddressUsageParamsSchema = z.object({
  addressId: z.uuid(),
});

export const churchAddressUsageResponseSchema = z.object({
  templates: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .describe('Event Templates with a time block at this address, by name.'),
  events: z
    .array(
      z.object({ id: z.string(), title: z.string(), start: z.iso.datetime() }),
    )
    .describe(
      'Upcoming Public Events (sent, not cancelled, a public block here that has not ended), by start.',
    ),
});

export const slugAvailabilityQuerySchema = z.object({
  slug: z.string().trim().max(200),
});

export const slugAvailabilityResponseSchema = z.object({
  status: z.enum(['free', 'taken', 'reserved', 'own_history']),
});
/** One logo file, PNG, JPEG or WebP by its bytes, at most 5 MB. */
export const uploadChurchLogoBodySchema = z.object({ file: z.file() });

export const restoreChurchLogoBodySchema = z.object({
  key: z.string().describe('A logo key this Church used before.'),
});
export type RestoreChurchLogoBody = z.infer<typeof restoreChurchLogoBodySchema>;

export const churchSettingsFieldErrorSchema = z.object({
  /** The refused request field; a list row is addressed by index, e.g. `contacts.1.value`. */
  field: z.string(),
  code: z.enum(CHURCH_SETTINGS_FIELD_CODES),
  message: z.string(),
});
export type ChurchSettingsFieldError = z.infer<
  typeof churchSettingsFieldErrorSchema
>;

export const churchSettingsValidationErrorResponseSchema = z.object({
  error: z.literal('VALIDATION_ERROR'),
  message: z.string(),
  fieldErrors: z.array(churchSettingsFieldErrorSchema),
});

const FIELD_CODE_MESSAGES: Record<ChurchSettingsFieldCode, ErrorMessage> = {
  CHURCH_NAME_LENGTH: m.error_church_settings_name_length,
  CHURCH_WEBSITE_HTTPS_ONLY: m.error_church_settings_website_https_only,
  CHURCH_WEBSITE_INVALID: m.error_church_settings_website_invalid,
  CHURCH_WEBSITE_TOO_LONG: m.error_church_settings_website_too_long,
  ACCENT_COLOR_INVALID: m.error_church_settings_accent_color_invalid,
  ADDRESS_REQUIRED: m.error_church_settings_address_required,
  ADDRESS_TOO_LONG: m.error_church_settings_address_too_long,
  ADDRESS_UF_INVALID: m.error_church_settings_address_uf_invalid,
  ADDRESS_CEP_INVALID: m.error_church_settings_address_cep_invalid,
  ADDRESS_PIN_INVALID: m.error_church_settings_address_pin_invalid,
  ADDRESS_MAIN_MULTIPLE: m.error_church_settings_address_main_multiple,
  ADDRESS_MAIN_REQUIRED: m.error_church_settings_address_main_required,
  ADDRESS_REPLACEMENT_REQUIRED:
    m.error_church_settings_address_replacement_required,
  SOCIAL_LINK_INVALID: m.error_church_settings_social_link_invalid,
  SOCIAL_LINK_UNSUPPORTED: m.error_church_settings_social_link_unsupported,
  SOCIAL_LINK_USE_CONTACT: m.error_church_settings_social_link_use_contact,
  SOCIAL_LINK_TOO_LONG: m.error_church_settings_social_link_too_long,
  LEGAL_NAME_REQUIRED: m.error_church_settings_legal_name_required,
  LEGAL_NAME_TOO_LONG: m.error_church_settings_legal_name_too_long,
  CNPJ_REQUIRED: m.error_church_settings_cnpj_required,
  CNPJ_INVALID: m.error_church_settings_cnpj_invalid,
  CNPJ_TAKEN: m.error_church_settings_cnpj_taken,
  CHURCH_SLUG_LENGTH: m.error_church_settings_slug_length,
  CHURCH_SLUG_FORMAT: m.error_church_settings_slug_format,
  CHURCH_SLUG_RESERVED: m.error_church_settings_slug_reserved,
  CHURCH_SLUG_TAKEN: m.error_church_settings_slug_taken,
  CONTACT_PHONE_INVALID: m.error_church_settings_contact_phone_invalid,
  CONTACT_EMAIL_INVALID: m.error_church_settings_contact_email_invalid,
  CONTACT_DESCRIPTION_TOO_LONG:
    m.error_church_settings_contact_description_too_long,
  CONTACT_GROUP_TOO_LONG: m.error_church_settings_contact_group_too_long,
  INVALID: m.error_church_settings_invalid,
};

/** One request-validation issue as the zod type provider reports it. */
export interface ChurchSettingsValidationIssue {
  instancePath: string;
  message?: string;
}

interface ToFieldErrorsInput {
  issues: readonly ChurchSettingsValidationIssue[];
  locale: Locale;
}

function isFieldCode(
  value: string | undefined,
): value is ChurchSettingsFieldCode {
  return CHURCH_SETTINGS_FIELD_CODES.some((code) => code === value);
}

/** The 422 body for one refused field. */
interface ChurchSettingsFieldErrorInput {
  field: string;
  code: ChurchSettingsFieldCode;
  locale: Locale;
}

export function churchSettingsFieldError({
  field,
  code,
  locale,
}: ChurchSettingsFieldErrorInput): ChurchSettingsFieldError {
  return { field, code, message: FIELD_CODE_MESSAGES[code]({}, { locale }) };
}

/** The first refusal of each field, worded in the request locale, in request order. */
export function toChurchSettingsFieldErrors({
  issues,
  locale,
}: ToFieldErrorsInput): ChurchSettingsFieldError[] {
  const errors = new Map<string, ChurchSettingsFieldError>();
  for (const issue of issues) {
    const field = issue.instancePath.replace(/^\//, '').replaceAll('/', '.');
    if (errors.has(field)) continue;
    const code = isFieldCode(issue.message) ? issue.message : 'INVALID';
    errors.set(field, churchSettingsFieldError({ field, code, locale }));
  }
  return [...errors.values()];
}

interface RefusalFieldErrorsInput {
  refusals: readonly ChurchAddressRefusal[];
  locale: Locale;
}

export function churchAddressRefusalsToFieldErrors({
  refusals,
  locale,
}: RefusalFieldErrorsInput): ChurchSettingsFieldError[] {
  return refusals.map(({ field, code }) => ({
    field,
    code,
    message: FIELD_CODE_MESSAGES[code]({}, { locale }),
  }));
}
