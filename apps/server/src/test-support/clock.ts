import { formatInTimeZone } from 'date-fns-tz';

export interface Clock {
  now(): Date;
}

export interface FixedClockOptions {
  instant: Date;
}

export class FixedClock implements Clock {
  private readonly instant: Date;

  constructor({ instant }: FixedClockOptions) {
    this.instant = new Date(instant);
  }

  now(): Date {
    return new Date(this.instant);
  }
}

export interface ToChurchDateOptions {
  instant: Date;
  timeZone: string;
}

export function toChurchDate({
  instant,
  timeZone,
}: ToChurchDateOptions): string {
  return formatInTimeZone(instant, timeZone, 'yyyy-MM-dd');
}

export interface GetCurrentChurchDateOptions {
  clock: Clock;
  timeZone: string;
}

export function getCurrentChurchDate({
  clock,
  timeZone,
}: GetCurrentChurchDateOptions): string {
  return toChurchDate({ instant: clock.now(), timeZone });
}
