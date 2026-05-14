import { Entity } from '@church/core';
import { InvalidDateRangeError } from '../errors/invalid-date-range';

export const EVENT_STATUS_OPTIONS = [
  'draft',
  'published',
  'cancelled',
] as const;
export type EventStatus = (typeof EVENT_STATUS_OPTIONS)[number];

export interface EventProps {
  churchId: string;
  ministryId: string;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  status: EventStatus;
}

export class Event extends Entity<EventProps> {
  constructor(
    props: Omit<EventProps, 'status'> & Partial<Pick<EventProps, 'status'>>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (props.startDate >= props.endDate) {
      throw new InvalidDateRangeError();
    }
    super(
      {
        ...props,
        status: props.status ?? 'draft',
      },
      id,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): string {
    return this._props.churchId;
  }

  get ministryId(): string {
    return this._props.ministryId;
  }

  get title(): string {
    return this._props.title;
  }

  get description(): string | undefined {
    return this._props.description;
  }

  get location(): string | undefined {
    return this._props.location;
  }

  get startDate(): Date {
    return this._props.startDate;
  }

  get endDate(): Date {
    return this._props.endDate;
  }

  get status(): EventStatus {
    return this._props.status;
  }

  public publish(): void {
    this._props.status = 'published';
    this._updatedAt = new Date();
  }

  public cancel(): void {
    this._props.status = 'cancelled';
    this._updatedAt = new Date();
  }
}
