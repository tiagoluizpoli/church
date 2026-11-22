import {
  detectSocialNetwork,
  type SocialNetwork,
} from '@church/app-config/social-networks';
import { z } from 'zod';

export const SOCIAL_LINK_FIELD_CODES = [
  'SOCIAL_LINK_INVALID',
  'SOCIAL_LINK_UNSUPPORTED',
  'SOCIAL_LINK_USE_CONTACT',
  'SOCIAL_LINK_TOO_LONG',
] as const;
export type SocialLinkFieldCode = (typeof SOCIAL_LINK_FIELD_CODES)[number];

export const SOCIAL_LINK_MAX = 50;
export const SOCIAL_LINK_URL_MAX = 2048;
export const SOCIAL_LINK_DESCRIPTION_MAX = 80;

/** A Social Link as stored; its network is always the one detected from its URL. */
export interface ChurchSocialLink {
  url: string;
  network: SocialNetwork;
  description: string | null;
}

/** One link of a save; list order is the display order. */
export type SocialLinkChange = ChurchSocialLink;

const REFUSAL_CODES = {
  INVALID: 'SOCIAL_LINK_INVALID',
  UNSUPPORTED: 'SOCIAL_LINK_UNSUPPORTED',
  USE_CONTACT: 'SOCIAL_LINK_USE_CONTACT',
} as const;

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

const socialLinkChangeSchema = z
  .object({
    url: z.string().transform((value, context) => {
      const trimmed = value.trim();
      const detection = detectSocialNetwork({ url: trimmed });
      if ('refusal' in detection) {
        context.addIssue({
          code: 'custom',
          message: REFUSAL_CODES[detection.refusal],
        });
        return z.NEVER;
      }
      const url = SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
      if (url.length > SOCIAL_LINK_URL_MAX) {
        context.addIssue({ code: 'custom', message: 'SOCIAL_LINK_TOO_LONG' });
        return z.NEVER;
      }
      return { url, network: detection.network };
    }),
    description: z
      .string()
      .nullish()
      .transform((value) => value?.trim().replace(/\s+/g, ' ') || null)
      .pipe(
        z
          .string()
          .max(SOCIAL_LINK_DESCRIPTION_MAX, 'SOCIAL_LINK_TOO_LONG')
          .nullable(),
      ),
  })
  .transform(
    ({ url, description }): SocialLinkChange => ({ ...url, description }),
  );

/** The Church's Social Links in display order; always public. */
export const socialLinksSchema = z
  .array(socialLinkChangeSchema)
  .max(SOCIAL_LINK_MAX);
