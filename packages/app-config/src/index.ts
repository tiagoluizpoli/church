import { z } from 'zod';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const positiveInt = z.number().int().positive();

export const appConfigSchema = z.object({
  /** Parked features: false = UI hidden and server route not registered. */
  parked: z.object({
    assignmentResponse: z.boolean(),
    volunteerCancel: z.boolean(),
    auditPanel: z.boolean(),
    commandPalette: z.boolean(),
  }),
  churchInvitation: z.object({ ttlMs: positiveInt }),
  ministryInvitation: z.object({ ttlMs: positiveInt }),
  invitationResend: z.object({
    cooldownMs: positiveInt,
    dailyCap: positiveInt,
    windowMs: positiveInt,
  }),
  verificationCode: z.object({
    ttlMs: positiveInt,
    resendCooldownMs: positiveInt,
    maxAttempts: positiveInt,
  }),
  redemptionRateLimit: z.object({
    windowMs: positiveInt,
    maxRequests: positiveInt,
  }),
  outbox: z.object({
    maxAttempts: positiveInt,
    backoffCapMinutes: positiveInt,
    /**
     * How long the email provider remembers an idempotency key (Resend: 24
     * hours). An email attempt at or past this age since its first attempt
     * is failed terminally rather than risk an undeduplicated duplicate.
     */
    emailIdempotencyRetentionMs: positiveInt,
  }),
  assignment: z.object({ cancelLeadTimeDays: positiveInt }),
  /** MVP choice until user settings exist. */
  defaultLocale: z.enum(['en', 'pt-BR']),
  /** Cookie holding the chosen locale; written by the `?lang=` override. */
  localeCookieName: z.string().min(1),
  localeQueryParam: z.string().min(1),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export const appConfig = appConfigSchema.parse({
  parked: {
    assignmentResponse: false,
    volunteerCancel: false,
    auditPanel: false,
    commandPalette: false,
  },
  churchInvitation: { ttlMs: 48 * HOUR_MS },
  ministryInvitation: { ttlMs: 14 * DAY_MS },
  invitationResend: { cooldownMs: MINUTE_MS, dailyCap: 10, windowMs: DAY_MS },
  verificationCode: {
    ttlMs: 10 * MINUTE_MS,
    resendCooldownMs: MINUTE_MS,
    maxAttempts: 5,
  },
  redemptionRateLimit: { windowMs: MINUTE_MS, maxRequests: 30 },
  outbox: {
    maxAttempts: 5,
    backoffCapMinutes: 60,
    emailIdempotencyRetentionMs: DAY_MS,
  },
  assignment: { cancelLeadTimeDays: 3 },
  defaultLocale: 'pt-BR',
  localeCookieName: 'church_locale',
  localeQueryParam: 'lang',
});

/** A copy of the config with every parked switch on (tests, OpenAPI export). */
export function withAllParkedOn(config: AppConfig): AppConfig {
  const parked = Object.fromEntries(
    Object.keys(config.parked).map((key) => [key, true]),
  );
  return appConfigSchema.parse({ ...config, parked });
}
