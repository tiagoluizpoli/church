import type { Instant } from '@church/time';
import type { EmailLocale } from '@/domain/contracts/infrastructure/email-sender';

/** One Shift as an email line: actual bounds, never the EventTimeBlock's. */
export interface ShiftLineInput {
  startsAt: Instant;
  endsAt: Instant;
  /** An anonymised line puts the Ministry here, or nothing. */
  eventTitle?: string;
  roleName: string;
  sectorName?: string;
  churchTimezone: string;
  locale: EmailLocale;
}

export interface EventWhenInput {
  start: Instant;
  end: Instant;
  churchTimezone: string;
  locale: EmailLocale;
}
