import { Entity } from '@church/core';
import { InvalidDateRangeError } from '../errors/invalid-date-range';

export const AVAILABILITY_TYPE_OPTIONS = ['available', 'unavailable'] as const;
export type AvailabilityType = (typeof AVAILABILITY_TYPE_OPTIONS)[number];

export interface AvailabilityProps {
  churchId: string;
  volunteerId: string;
  type: AvailabilityType;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  reason?: string;
  repeatRule?: string;
}

export class Availability extends Entity<AvailabilityProps> {
  constructor(
    props: Omit<AvailabilityProps, 'type' | 'isAllDay'> &
      Partial<Pick<AvailabilityProps, 'type' | 'isAllDay'>>,
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
      },
      id,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): string {
    return this._props.churchId;
  }

  get volunteerId(): string {
    return this._props.volunteerId;
  }

  get type(): AvailabilityType {
    return this._props.type;
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
