import { Entity } from '@church/core';
import { InvalidDateRangeError } from '../errors/invalid-date-range';

export const TIME_SLOT_STATUS_OPTIONS = ['active', 'cancelled'] as const;
export type TimeSlotStatus = (typeof TIME_SLOT_STATUS_OPTIONS)[number];

export interface TimeSlotProps {
  churchId: string;
  eventId: string;
  startTime: Date;
  endTime: Date;
  label?: string;
  status: TimeSlotStatus;
}

export class TimeSlot extends Entity<TimeSlotProps> {
  constructor(
    props: Omit<TimeSlotProps, 'status'> &
      Partial<Pick<TimeSlotProps, 'status'>>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (props.startTime >= props.endTime) {
      throw new InvalidDateRangeError();
    }
    super(
      {
        ...props,
        status: props.status ?? 'active',
      },
      id,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): string {
    return this._props.churchId;
  }

  get eventId(): string {
    return this._props.eventId;
  }

  get startTime(): Date {
    return this._props.startTime;
  }

  get endTime(): Date {
    return this._props.endTime;
  }

  get label(): string | undefined {
    return this._props.label;
  }

  get status(): TimeSlotStatus {
    return this._props.status;
  }

  public cancel(): void {
    this._props.status = 'cancelled';
    this._updatedAt = new Date();
  }
}
