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

/** The shared Church Slug rule, read by the server (`@church/db`) and the web. Slug format rules belong to the Church Settings spec. */
export const BaseChurchSlugSchema = z
  .string()
  .trim()
  .min(1)
  .refine((slug) => !reservedSlugs.has(slug.toLowerCase()), {
    error: ({ input }) =>
      `"${String(input).trim()}" is reserved by the platform. Choose a different Church Slug.`,
  });
