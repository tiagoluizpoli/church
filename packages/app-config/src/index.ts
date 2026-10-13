const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface AppConfig {
  /** Parked features: false = UI hidden and server route not registered. */
  parked: {
    assignmentResponse: boolean;
    volunteerCancel: boolean;
    auditPanel: boolean;
    commandPalette: boolean;
  };
  churchInvitation: { ttlMs: number };
  ministryInvitation: { ttlMs: number };
  invitationResend: { cooldownMs: number; dailyCap: number; windowMs: number };
  verificationCode: {
    ttlMs: number;
    resendCooldownMs: number;
    maxAttempts: number;
  };
  redemptionRateLimit: { windowMs: number; maxRequests: number };
  outbox: { maxAttempts: number; backoffCapMinutes: number };
  assignment: { cancelLeadTimeDays: number };
}

export const appConfig = {
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
  outbox: { maxAttempts: 5, backoffCapMinutes: 60 },
  assignment: { cancelLeadTimeDays: 3 },
} as const satisfies AppConfig;

/** A copy of the config with every parked switch on (tests, OpenAPI export). */
export function withAllParkedOn(config: AppConfig): AppConfig {
  return {
    ...config,
    parked: Object.fromEntries(
      Object.keys(config.parked).map((key) => [key, true]),
    ) as AppConfig['parked'],
  };
}
