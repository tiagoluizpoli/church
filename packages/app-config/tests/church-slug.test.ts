import { describe, expect, it } from 'vitest';
import {
  BaseChurchSlugSchema,
  RESERVED_CHURCH_SLUGS,
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
