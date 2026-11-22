import { describe, expect, it } from 'vitest';
import { churchContactSchema } from '@/domain/church-contact';

function row(overrides: Record<string, unknown>) {
  return {
    kind: 'phone',
    phoneType: 'mobile',
    value: '',
    description: null,
    isWhatsApp: false,
    isPublic: false,
    ...overrides,
  };
}

function issueOf(value: unknown) {
  const result = churchContactSchema.safeParse(value);
  return result.success
    ? undefined
    : {
        path: result.error.issues[0]?.path,
        message: result.error.issues[0]?.message,
      };
}

describe('Church Contact phone', () => {
  it.each([
    ['(11) 98765-4321', '+5511987654321'],
    ['11987654321', '+5511987654321'],
    ['+55 11 98765-4321', '+5511987654321'],
    ['(11) 3456-7890', '+551134567890'],
  ])('stores %s as E.164 %s', (value, expected) => {
    expect(churchContactSchema.parse(row({ value })).value).toBe(expected);
  });

  it.each([
    '',
    '123',
    '(11) 1234',
    '+1 202 555 0123',
    'abc',
  ])('refuses %j', (value) => {
    expect(issueOf(row({ value }))).toEqual({
      path: ['value'],
      message: 'CONTACT_PHONE_INVALID',
    });
  });

  it('keeps the WhatsApp mark on phones only', () => {
    const phone = churchContactSchema.parse(
      row({ value: '11987654321', isWhatsApp: true }),
    );
    const email = churchContactSchema.parse(
      row({ kind: 'email', value: 'a@b.com', isWhatsApp: true }),
    );
    expect([phone.isWhatsApp, email.isWhatsApp]).toEqual([true, false]);
  });
});

describe('Church Contact email', () => {
  it('lowercases and trims', () => {
    const parsed = churchContactSchema.parse(
      row({ kind: 'email', value: '  Secretaria@Igreja.ORG ' }),
    );
    expect(parsed.value).toBe('secretaria@igreja.org');
    expect(parsed.phoneType).toBeNull();
  });

  it.each(['', 'no-at', 'a@', '@b.com'])('refuses %j', (value) => {
    expect(issueOf(row({ kind: 'email', value }))).toEqual({
      path: ['value'],
      message: 'CONTACT_EMAIL_INVALID',
    });
  });
});

describe('Church Contact description', () => {
  it('trims, and an empty one is none', () => {
    const parsed = churchContactSchema.parse(
      row({ value: '11987654321', description: '  Secretaria ' }),
    );
    const none = churchContactSchema.parse(
      row({ value: '11987654321', description: '  ' }),
    );
    expect([parsed.description, none.description]).toEqual([
      'Secretaria',
      null,
    ]);
  });

  it('refuses over 80 characters', () => {
    expect(
      issueOf(row({ value: '11987654321', description: 'a'.repeat(81) })),
    ).toEqual({
      path: ['description'],
      message: 'CONTACT_DESCRIPTION_TOO_LONG',
    });
  });
});
