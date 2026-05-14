import { Entity } from '@church/core';
import { InvalidDateRangeError } from '../errors/invalid-date-range';

export interface TimeSlotProps {
  churchId: string;
  eventId: string;
  startTime: Date;
  endTime: Date;
  label?: string;
}

export class TimeSlot extends Entity<TimeSlotProps> {
  constructor(
    props: TimeSlotProps,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (props.startTime >= props.endTime) {
      throw new InvalidDateRangeError();
    }
    super(props, id, createdAt, updatedAt);
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
}
