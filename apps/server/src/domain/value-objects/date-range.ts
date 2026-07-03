import { InvalidDateRangeError } from '@/domain/errors/invalid-date-range';
import { toChurchDate } from '@/test-support/clock';

export interface CreateDateRangeInput {
  start: Date;
  end: Date;
}

export interface CreateDateOnlyDateRangeInput {
  start: Date;
  end: Date;
  timeZone: string;
}

export interface DateRangeContainsInput {
  date: Date;
}

export interface DateRangeOverlapsInput {
  other: DateRange;
}

interface NormalizeChurchDateInput {
  instant: Date;
  timeZone: string;
}

export class DateRange {
  private constructor(
    readonly start: Date,
    readonly end: Date,
  ) {}

  static create({ start, end }: CreateDateRangeInput): DateRange {
    if (end <= start) {
      throw new InvalidDateRangeError();
    }
    return new DateRange(start, end);
  }

  static createDateOnly({
    start,
    end,
    timeZone,
  }: CreateDateOnlyDateRangeInput): DateRange {
    return DateRange.create({
      start: normalizeChurchDate({ instant: start, timeZone }),
      end: normalizeChurchDate({ instant: end, timeZone }),
    });
  }

  contains({ date }: DateRangeContainsInput): boolean {
    return date >= this.start && date <= this.end;
  }

  overlaps({ other }: DateRangeOverlapsInput): boolean {
    return this.start < other.end && this.end > other.start;
  }
}

function normalizeChurchDate({
  instant,
  timeZone,
}: NormalizeChurchDateInput): Date {
  const churchDate = toChurchDate({ instant, timeZone });
  return new Date(`${churchDate}T00:00:00.000Z`);
}
