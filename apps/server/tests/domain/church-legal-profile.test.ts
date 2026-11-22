import { describe, expect, it } from 'vitest';
import { cnpjSchema, legalProfileSchema } from '@/domain/church-legal-profile';

const VALID_CNPJ = '11222333000181';

function issueOf(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return result.error?.issues[0]?.message;
}

describe('cnpjSchema', () => {
  it.each([
    ['digits', VALID_CNPJ],
    ['mask', '11.222.333/0001-81'],
    ['padded mask', '  11.222.333/0001-81 '],
  ])('accepts %s and stores the 14 digits', (_name, value) => {
    expect(cnpjSchema.parse(value)).toBe(VALID_CNPJ);
  });

  it.each([
    ['too short', '1122233300018'],
    ['too long', '112223330001811'],
    ['letters', '1122233300018a'],
    ['wrong first check digit', '11222333000171'],
    ['wrong second check digit', '11222333000182'],
    ['one repeated digit', '00000000000000'],
  ])('refuses %s', (_name, value) => {
    expect(issueOf(cnpjSchema.safeParse(value))).toBe('CNPJ_INVALID');
  });
});

describe('legalProfileSchema', () => {
  it('normalises the legal name and the CNPJ', () => {
    expect(
      legalProfileSchema.parse({
        legalName: '  Igreja   Batista  Esperança ',
        cnpj: '11.222.333/0001-81',
        isPublic: true,
      }),
    ).toEqual({
      legalName: 'Igreja Batista Esperança',
      cnpj: VALID_CNPJ,
      isPublic: true,
    });
  });

  it('treats a blank name and CNPJ as no legal profile', () => {
    expect(
      legalProfileSchema.parse({ legalName: ' ', cnpj: null, isPublic: true }),
    ).toBeNull();
  });

  it('asks for the missing half', () => {
    const noName = legalProfileSchema.safeParse({
      legalName: '',
      cnpj: VALID_CNPJ,
      isPublic: false,
    });
    const noCnpj = legalProfileSchema.safeParse({
      legalName: 'Igreja',
      cnpj: '',
      isPublic: false,
    });

    expect(noName.error?.issues[0]).toMatchObject({
      path: ['legalName'],
      message: 'LEGAL_NAME_REQUIRED',
    });
    expect(noCnpj.error?.issues[0]).toMatchObject({
      path: ['cnpj'],
      message: 'CNPJ_REQUIRED',
    });
  });

  it('refuses a name over 150 characters', () => {
    const result = legalProfileSchema.safeParse({
      legalName: 'a'.repeat(151),
      cnpj: VALID_CNPJ,
      isPublic: false,
    });

    expect(result.error?.issues[0]).toMatchObject({
      path: ['legalName'],
      message: 'LEGAL_NAME_TOO_LONG',
    });
  });
});
