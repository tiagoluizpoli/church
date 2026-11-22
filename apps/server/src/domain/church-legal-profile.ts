import { z } from 'zod';

export const LEGAL_PROFILE_FIELD_CODES = [
  'LEGAL_NAME_REQUIRED',
  'LEGAL_NAME_TOO_LONG',
  'CNPJ_REQUIRED',
  'CNPJ_INVALID',
  'CNPJ_TAKEN',
] as const;
export type LegalProfileFieldCode = (typeof LEGAL_PROFILE_FIELD_CODES)[number];

export const LEGAL_NAME_MAX = 150;
const CNPJ_LENGTH = 14;
const CNPJ_BASE_LENGTH = 12;
const CNPJ_WEIGHT_CYCLE = 8;
const CNPJ_MODULUS = 11;

/** The Church Legal Profile as stored; the CNPJ is its 14 digits. */
export interface ChurchLegalProfile {
  legalName: string;
  cnpj: string;
  isPublic: boolean;
}

interface CheckDigitInput {
  digits: readonly number[];
}

/** The CNPJ check digit of `digits`: weights 2..9 cycle from the right, mod 11. */
function checkDigit({ digits }: CheckDigitInput): number {
  const sum = digits.reduceRight(
    (total, digit, index) =>
      total + digit * (((digits.length - 1 - index) % CNPJ_WEIGHT_CYCLE) + 2),
    0,
  );
  const rest = sum % CNPJ_MODULUS;
  return rest < 2 ? 0 : CNPJ_MODULUS - rest;
}

/** A CNPJ, mask accepted, check digits validated; stored as its 14 digits. */
export const cnpjSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .regex(/^(\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/, 'CNPJ_INVALID'),
  )
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => {
    if (digits.length !== CNPJ_LENGTH || /^(\d)\1+$/.test(digits)) return false;
    const numbers = [...digits].map(Number);
    const first = checkDigit({ digits: numbers.slice(0, CNPJ_BASE_LENGTH) });
    const second = checkDigit({
      digits: [...numbers.slice(0, CNPJ_BASE_LENGTH), first],
    });
    return (
      numbers[CNPJ_BASE_LENGTH] === first && numbers[CNPJ_LENGTH - 1] === second
    );
  }, 'CNPJ_INVALID');

function blankToNull(value: string | null | undefined): string | null {
  return value?.trim().replace(/\s+/g, ' ') || null;
}

/**
 * The legal profile of a save: both fields blank means none; one without the
 * other is refused on the blank one.
 */
export const legalProfileSchema = z
  .object({
    legalName: z.string().nullish().transform(blankToNull),
    cnpj: z.string().nullish().transform(blankToNull),
    isPublic: z.boolean(),
  })
  .transform((value, context): ChurchLegalProfile | null => {
    const { legalName, cnpj, isPublic } = value;
    if (!legalName && !cnpj) return null;
    if (!legalName) {
      context.addIssue({
        code: 'custom',
        path: ['legalName'],
        message: 'LEGAL_NAME_REQUIRED',
      });
    } else if (legalName.length > LEGAL_NAME_MAX) {
      context.addIssue({
        code: 'custom',
        path: ['legalName'],
        message: 'LEGAL_NAME_TOO_LONG',
      });
    }
    const document = cnpj ? cnpjSchema.safeParse(cnpj) : undefined;
    if (!document) {
      context.addIssue({
        code: 'custom',
        path: ['cnpj'],
        message: 'CNPJ_REQUIRED',
      });
    } else if (!document.success) {
      context.addIssue({
        code: 'custom',
        path: ['cnpj'],
        message: 'CNPJ_INVALID',
      });
    }
    if (!legalName || !document?.success) return z.NEVER;
    return { legalName, cnpj: document.data, isPublic };
  });
