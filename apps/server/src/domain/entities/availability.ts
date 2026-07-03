import { Entity, type LooseProps } from '@church/core';
import type {
  AvailabilityCheckId,
  AvailabilityId,
  ChurchId,
  EventId,
  ShiftId,
  VolunteerId,
} from '../branded-ids';
import { InvalidDateRangeError } from '../errors/invalid-date-range';

export const AVAILABILITY_TYPE_OPTIONS = ['available', 'unavailable'] as const;
export type AvailabilityType = (typeof AVAILABILITY_TYPE_OPTIONS)[number];

export interface AvailabilityProps {
  churchId: ChurchId;
  availabilityCheckId?: AvailabilityCheckId;
  shiftId?: ShiftId;
  volunteerId: VolunteerId;
  eventId?: EventId;
  type: AvailabilityType;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  reason?: string;
  repeatRule?: string;
}

export class Availability extends Entity<AvailabilityProps, AvailabilityId> {
  constructor(
    props: Omit<LooseProps<AvailabilityProps>, 'type' | 'isAllDay'> &
      Partial<Pick<LooseProps<AvailabilityProps>, 'type' | 'isAllDay'>>,
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
        type: props.type ?? 'unavailable',
        isAllDay: props.isAllDay ?? false,
      } as unknown as AvailabilityProps,
      id as AvailabilityId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get availabilityCheckId(): AvailabilityCheckId | undefined {
    return this._props.availabilityCheckId;
  }

  get shiftId(): ShiftId | undefined {
    return this._props.shiftId;
  }

  get volunteerId(): VolunteerId {
    return this._props.volunteerId;
  }

  get type(): AvailabilityType {
    return this._props.type;
  }

  get eventId(): EventId | undefined {
    return this._props.eventId;
  }

  get startTime(): Date {
    return this._props.startTime;
  }

  get endTime(): Date {
    return this._props.endTime;
  }

  get isAllDay(): boolean {
    return this._props.isAllDay;
  }

  get reason(): string | undefined {
    return this._props.reason;
  }

  get repeatRule(): string | undefined {
    return this._props.repeatRule;
  }
}
