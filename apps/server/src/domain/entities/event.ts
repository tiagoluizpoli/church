import { Entity, type LooseProps } from '@church/core';
import type {
  ChurchId,
  EventId,
  EventTemplateId,
  MinistryId,
  PlanningCycleId,
} from '../branded-ids';
import { InvalidDateRangeError } from '../errors/invalid-date-range';
import type { TimeSlot } from './time-slot';

export const EVENT_STATUS_OPTIONS = [
  'draft',
  'scheduled',
  'cancelled',
  'past',
] as const;
export type EventStatus = (typeof EVENT_STATUS_OPTIONS)[number];

export const EVENT_TYPE_OPTIONS = ['hourly', 'day_based'] as const;
export type EventType = (typeof EVENT_TYPE_OPTIONS)[number];

export interface EventProps {
  churchId: ChurchId;
  planningCycleId: PlanningCycleId;
  sourceTemplateId?: EventTemplateId;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  status: EventStatus;
  eventType: EventType;
}

export interface EventWithSlots {
  event: Event;
  slots: TimeSlot[];
}

export class Event extends Entity<EventProps, EventId> {
  constructor(
    props:
      | (Omit<LooseProps<EventProps>, 'status' | 'eventType'> &
          Partial<Pick<LooseProps<EventProps>, 'status' | 'eventType'>>)
      | (Omit<
          LooseProps<EventProps>,
          'planningCycleId' | 'sourceTemplateId' | 'status' | 'eventType'
        > & {
          ministryId: MinistryId | string;
        } & Partial<Pick<LooseProps<EventProps>, 'status' | 'eventType'>>),
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (props.startDate >= props.endDate) {
      throw new InvalidDateRangeError();
    }
    const normalizedProps =
      'planningCycleId' in props
        ? props
        : {
            ...props,
            ministryId: undefined,
            planningCycleId: props.ministryId,
          };
    super(
      {
        ...normalizedProps,
        status: props.status ?? 'draft',
        eventType: props.eventType ?? 'hourly',
      } as EventProps,
      id as EventId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get planningCycleId(): PlanningCycleId {
    return this._props.planningCycleId;
  }

  get sourceTemplateId(): EventTemplateId | undefined {
    return this._props.sourceTemplateId;
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

  get eventType(): EventType {
    return this._props.eventType;
  }

  public markScheduled(): void {
    this._props.status = 'scheduled';
    this._updatedAt = new Date();
  }

  public cancel(): void {
    this._props.status = 'cancelled';
    this._updatedAt = new Date();
  }

  public markAsPast(): void {
    this._props.status = 'past';
    this._updatedAt = new Date();
  }
}
