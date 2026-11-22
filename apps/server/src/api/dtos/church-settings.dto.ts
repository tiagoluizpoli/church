import { m } from '@church/i18n/messages';
import type { Locale } from '@church/i18n/runtime';
import { z } from 'zod';
import {
  accentColorSchema,
  CHURCH_SETTINGS_FIELD_CODES,
  type ChurchSettingsFieldCode,
  churchNameSchema,
  churchSlugSchema,
  churchWebsiteSchema,
} from '../../domain/church-settings';
import type { ErrorMessage } from '../utils/error-table';

export const churchSettingsResponseSchema = z.object({
  name: z.string(),
  slug: z.string(),
  website: z.string().nullable(),
  accentColor: z.string().nullable(),
  /** Object-storage key of the logo (re-applied by *Desfazer*). */
  logoKey: z.string().nullable(),
  /** Anonymous URL of the logo, built from its key. */
  logoUrl: z.string().nullable(),
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
});
export type UpdateChurchSettingsBody = z.output<
  typeof updateChurchSettingsBodySchema
>;

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
  CHURCH_SLUG_LENGTH: m.error_church_settings_slug_length,
  CHURCH_SLUG_FORMAT: m.error_church_settings_slug_format,
  CHURCH_SLUG_RESERVED: m.error_church_settings_slug_reserved,
  CHURCH_SLUG_TAKEN: m.error_church_settings_slug_taken,
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
