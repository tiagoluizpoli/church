import { describe, expect, it } from 'vitest';
import {
  BaseChurchSlugSchema,
  churchSlugRefusal,
  RESERVED_CHURCH_SLUGS,
  slugFromName,
} from '../src/church-slug';

describe('BaseChurchSlugSchema', () => {
  it('lists the platform reserved words', () => {
    expect([...RESERVED_CHURCH_SLUGS]).toEqual([
      'app',
      'api',
      'assets',
      'login',
      'logout',
      'signup',
      'forgot-password',
      'reset-password',
      'invitations',
      'church',
      'admin',
      'help',
      'about',
      'privacy',
      'terms',
      'static',
      'www',
    ]);
  });

  it.each(
    RESERVED_CHURCH_SLUGS,
  )('refuses the reserved slug %s with its own error', (reserved) => {
    const result = BaseChurchSlugSchema.safeParse(reserved);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.message).toBe(
      `"${reserved}" is reserved by the platform. Choose a different Church Slug.`,
    );
  });

  it('refuses a reserved slug regardless of case and surrounding spaces', () => {
    expect(BaseChurchSlugSchema.safeParse(' Admin ').success).toBe(false);
  });

  it('accepts an ordinary slug', () => {
    expect(BaseChurchSlugSchema.parse('igreja-semente')).toBe('igreja-semente');
  });
});

describe('churchSlugRefusal', () => {
  it.each([
    ['igreja-semente', undefined],
    ['abc', undefined],
    ['a1-b2-c3', undefined],
    ['a'.repeat(63), undefined],
    ['ab', 'LENGTH'],
    ['', 'LENGTH'],
    ['a'.repeat(64), 'LENGTH'],
    ['Igreja', 'FORMAT'],
    ['igreja_semente', 'FORMAT'],
    ['igreja semente', 'FORMAT'],
    ['-igreja', 'FORMAT'],
    ['igreja-', 'FORMAT'],
    ['igreja--semente', 'FORMAT'],
    ['igrejá', 'FORMAT'],
    ['admin', 'RESERVED'],
    ['www', 'RESERVED'],
  ])('answers %j with %s', (slug, refusal) => {
    expect(churchSlugRefusal(slug)).toBe(refusal);
  });
});

describe('BaseChurchSlugSchema format', () => {
  it('refuses a badly formed slug', () => {
    expect(BaseChurchSlugSchema.safeParse('Igreja Semente').success).toBe(
      false,
    );
  });

  it('refuses a slug that is too short or too long', () => {
    expect(BaseChurchSlugSchema.safeParse('ab').success).toBe(false);
    expect(BaseChurchSlugSchema.safeParse('a'.repeat(64)).success).toBe(false);
  });
});

describe('slugFromName', () => {
  it.each([
    ['Igreja Semente', 'igreja-semente'],
    ['  Igreja   Batista Esperança!  ', 'igreja-batista-esperanca'],
    ['Comunidade São José (Centro)', 'comunidade-sao-jose-centro'],
    ['100% Vida', '100-vida'],
    [`${'a'.repeat(62)} b`, 'a'.repeat(62)],
  ])('turns %j into %j', (name, slug) => {
    expect(slugFromName(name)).toBe(slug);
  });

  it('gives a slug the schema accepts for an ordinary name', () => {
    expect(
      BaseChurchSlugSchema.safeParse(slugFromName('Igreja Colheita')).success,
    ).toBe(true);
  });
});
