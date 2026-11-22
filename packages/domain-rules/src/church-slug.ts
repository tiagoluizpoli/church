import { z } from 'zod';

/** Words a Church Slug may never be: a Church's public page must not shadow, or be shadowed by, an app page. */
export const RESERVED_CHURCH_SLUGS = [
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
] as const;

const reservedSlugs: ReadonlySet<string> = new Set(RESERVED_CHURCH_SLUGS);

export const CHURCH_SLUG_MIN = 3;
export const CHURCH_SLUG_MAX = 63;
const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ChurchSlugRefusal = 'LENGTH' | 'FORMAT' | 'RESERVED';

/** Why a (trimmed) slug is refused, or undefined when it is acceptable; length is reported before format. */
export function churchSlugRefusal(slug: string): ChurchSlugRefusal | undefined {
  if (slug.length < CHURCH_SLUG_MIN || slug.length > CHURCH_SLUG_MAX) {
    return 'LENGTH';
  }
  if (!SLUG_FORMAT.test(slug)) return 'FORMAT';
  return reservedSlugs.has(slug) ? 'RESERVED' : undefined;
}

/** A clean slug from a Church name: accents dropped, lower case, runs of other characters become one hyphen. */
export function slugFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, CHURCH_SLUG_MAX)
    .replace(/^-+|-+$/g, '');
}

/** The shared Church Slug rule, read by the server (`@church/db`) and the web. Uniqueness and slug history need the database and live server-side. */
export const BaseChurchSlugSchema = z
  .string()
  .trim()
  .refine((slug) => churchSlugRefusal(slug) === undefined, {
    error: ({ input }) => {
      const slug = String(input).trim();
      return churchSlugRefusal(slug) === 'RESERVED'
        ? `"${slug}" is reserved by the platform. Choose a different Church Slug.`
        : `"${slug}" is not a valid Church Slug: 3–63 lower-case letters, digits and single hyphens.`;
    },
  });
