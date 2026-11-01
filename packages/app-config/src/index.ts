import { z } from 'zod';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const positiveInt = z.number().int().positive();

export const appConfigSchema = z.object({
  /** Product name on app-branded (church-less) email. Placeholder until branding is decided. */
  appName: z.string().trim().min(1),
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
  notifications: z.object({
    /** Independent channel switches; a disabled sink is skipped for that processing. */
    email: z.object({ enabled: z.boolean() }),
    inbox: z.object({ enabled: z.boolean() }),
    /** How often the web refetches the member inbox while online. */
    pollIntervalMs: positiveInt,
    /** Inbox page size when the request names none, and the most it may ask for. */
    pageSize: positiveInt,
    maxPageSize: positiveInt,
  }),
  /** MVP choice until user settings exist. */
  defaultLocale: z.enum(['en', 'pt-BR']),
  /** Cookie holding the chosen locale; written by the `?lang=` override. */
  localeCookieName: z.string().min(1),
  localeQueryParam: z.string().min(1),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export const appConfig = appConfigSchema.parse({
  appName: 'Church',
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
  notifications: {
    email: { enabled: true },
    inbox: { enabled: true },
    pollIntervalMs: 2 * MINUTE_MS,
    pageSize: 20,
    maxPageSize: 50,
  },
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
