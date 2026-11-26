import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  accentColorSchema,
  accentTextColor,
  churchNameSchema,
  churchWebsiteSchema,
} from '@/domain/church-settings';

interface IssueOfInput {
  schema: z.ZodType;
  value: unknown;
}

function issueOf({ schema, value }: IssueOfInput): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('Church name', () => {
  it('trims and collapses inner spaces', () => {
    expect(churchNameSchema.parse('  Igreja   Batista\t Esperança ')).toBe(
      'Igreja Batista Esperança',
    );
  });

  it('accepts 2 and 80 characters after normalising', () => {
    expect(churchNameSchema.parse(' IB ')).toBe('IB');
    expect(churchNameSchema.parse('a'.repeat(80))).toBe('a'.repeat(80));
  });

  it.each([
    ['', 'CHURCH_NAME_LENGTH'],
    ['   ', 'CHURCH_NAME_LENGTH'],
    [' a ', 'CHURCH_NAME_LENGTH'],
    ['a'.repeat(81), 'CHURCH_NAME_LENGTH'],
  ])('refuses %j with %s', (value, code) => {
    expect(issueOf({ schema: churchNameSchema, value })).toBe(code);
  });
});

describe('Church website', () => {
  it('stores an empty value as no website', () => {
    expect(churchWebsiteSchema.parse('')).toBeNull();
    expect(churchWebsiteSchema.parse('   ')).toBeNull();
    expect(churchWebsiteSchema.parse(null)).toBeNull();
  });

  it('prepends https:// to a bare domain', () => {
    expect(churchWebsiteSchema.parse(' ibesperanca.org.br ')).toBe(
      'https://ibesperanca.org.br',
    );
    expect(churchWebsiteSchema.parse('ibesperanca.org.br/cultos?x=1')).toBe(
      'https://ibesperanca.org.br/cultos?x=1',
    );
  });

  it('keeps an https address as typed', () => {
    expect(churchWebsiteSchema.parse('https://IBEsperanca.org.br/A')).toBe(
      'https://IBEsperanca.org.br/A',
    );
  });

  it('accepts an address of exactly 2048 characters', () => {
    const url = `https://a.com/${'x'.repeat(2048 - 'https://a.com/'.length)}`;
    expect(churchWebsiteSchema.parse(url)).toBe(url);
  });

  it.each([
    ['http://ibesperanca.org.br', 'CHURCH_WEBSITE_HTTPS_ONLY'],
    ['ftp://ibesperanca.org.br', 'CHURCH_WEBSITE_HTTPS_ONLY'],
    ['ibesperanca', 'CHURCH_WEBSITE_INVALID'],
    ['ib esperanca.org', 'CHURCH_WEBSITE_INVALID'],
    ['https://', 'CHURCH_WEBSITE_INVALID'],
    [`https://a.com/${'x'.repeat(2048)}`, 'CHURCH_WEBSITE_TOO_LONG'],
  ])('refuses %j with %s', (value, code) => {
    expect(issueOf({ schema: churchWebsiteSchema, value })).toBe(code);
  });
});

describe('Accent colour', () => {
  it('takes no colour as the app default', () => {
    expect(accentColorSchema.parse(null)).toBeNull();
  });

  it('stores a hex colour lowercased', () => {
    expect(accentColorSchema.parse('#1D4ED8')).toBe('#1d4ed8');
  });

  it.each([
    '1d4ed8',
    '#1d4ed',
    '#1d4ed8f',
    'blue',
    '#gggggg',
    '',
  ])('refuses %j', (value) => {
    expect(issueOf({ schema: accentColorSchema, value })).toBe(
      'ACCENT_COLOR_INVALID',
    );
  });
});

describe('Text on the accent colour', () => {
  it.each([
    ['#000000', '#ffffff'],
    ['#1d4ed8', '#ffffff'],
    ['#334155', '#ffffff'],
    ['#b91c1c', '#ffffff'],
    ['#ffffff', '#111111'],
    ['#facc15', '#111111'],
    ['#22d3ee', '#111111'],
  ])('puts readable text on %s', (accentColor, text) => {
    expect(accentTextColor({ accentColor })).toBe(text);
  });
});
