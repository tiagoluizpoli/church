import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';
import { contactGroupNameSchema } from './contact-group';

/** Countries a phone Church Contact may be in; adding one is config only. */
export const ALLOWED_PHONE_COUNTRIES = ['BR'] as const;
export const CONTACT_DESCRIPTION_MAX = 80;
export const CONTACTS_MAX = 50;

export const CHURCH_CONTACT_KINDS = ['email', 'phone'] as const;
export const CHURCH_CONTACT_PHONE_TYPES = ['mobile', 'landline'] as const;

/** One Church Contact as stored; `position` is its index in the list. */
export interface ChurchContact {
  kind: (typeof CHURCH_CONTACT_KINDS)[number];
  /** Phones only. */
  phoneType: (typeof CHURCH_CONTACT_PHONE_TYPES)[number] | null;
  /** E.164 for a phone, lower-case for an email. */
  value: string;
  description: string | null;
  /** Phones only. */
  isWhatsApp: boolean;
  isPublic: boolean;
  /** *Pessoa ou ministério*; `null` is ungrouped ("Da igreja"). */
  group: string | null;
}

const [DEFAULT_COUNTRY] = ALLOWED_PHONE_COUNTRIES;
const emailSchema = z.email();

interface ToE164Input {
  value: string;
}

/** E.164 when the number is valid in an allowed country, else undefined. */
function toE164({ value }: ToE164Input): string | undefined {
  const phone = parsePhoneNumberFromString(value, DEFAULT_COUNTRY);
  const allowed = ALLOWED_PHONE_COUNTRIES.some(
    (country) => country === phone?.country,
  );
  return phone?.isValid() && allowed ? phone.number : undefined;
}

/** One Church Contact row, normalised; refusals are stable codes at the row's field. */
export const churchContactSchema = z
  .object({
    kind: z.enum(CHURCH_CONTACT_KINDS),
    phoneType: z.enum(CHURCH_CONTACT_PHONE_TYPES).nullable(),
    value: z.string(),
    description: z.string().nullable(),
    isWhatsApp: z.boolean(),
    isPublic: z.boolean(),
    group: contactGroupNameSchema,
  })
  .transform((row, context): ChurchContact => {
    const isPhone = row.kind === 'phone';
    const trimmed = row.value.trim();
    const value = isPhone
      ? toE164({ value: trimmed })
      : emailSchema.safeParse(trimmed.toLowerCase()).data;
    if (value === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: isPhone ? 'CONTACT_PHONE_INVALID' : 'CONTACT_EMAIL_INVALID',
      });
      return z.NEVER;
    }
    const description = row.description?.trim() || null;
    if (description && description.length > CONTACT_DESCRIPTION_MAX) {
      context.addIssue({
        code: 'custom',
        path: ['description'],
        message: 'CONTACT_DESCRIPTION_TOO_LONG',
      });
      return z.NEVER;
    }
    return {
      kind: row.kind,
      phoneType: isPhone ? (row.phoneType ?? 'mobile') : null,
      value,
      description,
      isWhatsApp: isPhone && row.isWhatsApp,
      isPublic: row.isPublic,
      group: row.group,
    };
  });
