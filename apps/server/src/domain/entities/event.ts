import { Entity, type LooseProps } from '@church/core';
import { compareInstants, type Instant, now, toDate } from '@church/time';
import type {
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  MinistryId,
} from '../branded-ids';
import { InvalidDateRangeError } from '../errors/invalid-date-range';
import type { EventTimeBlock } from './event-time-block';

export const EVENT_STATUS_OPTIONS = [
  'draft',
  'scheduled',
  'cancelled',
  'past',
] as const;
export type EventStatus = (typeof EVENT_STATUS_OPTIONS)[number];

export interface EventProps {
  churchId: ChurchId;
  cycleId: CycleId;
  sourceTemplateId?: EventTemplateId;
  title: string;
  description?: string;
  location?: string;
  start: Instant;
  end: Instant;
  status: EventStatus;
}

export interface EventWithEventTimeBlocks {
  event: Event;
  slots: EventTimeBlock[];
}

export class Event extends Entity<EventProps, EventId> {
  constructor(
    props:
      | (Omit<LooseProps<EventProps>, 'status'> &
          Partial<Pick<LooseProps<EventProps>, 'status'>>)
      | (Omit<
          LooseProps<EventProps>,
          'cycleId' | 'sourceTemplateId' | 'status'
        > & {
          ministryId: MinistryId | string;
        } & Partial<Pick<LooseProps<EventProps>, 'status'>>),
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (
      compareInstants({
        left: props.start as Instant,
        right: props.end as Instant,
      }) >= 0
    ) {
      throw new InvalidDateRangeError();
    }
    const normalizedProps =
      'cycleId' in props
        ? props
        : {
            ...props,
            ministryId: undefined,
            cycleId: props.ministryId,
          };
    super(
      {
        ...normalizedProps,
        status: props.status ?? 'draft',
      } as EventProps,
      id as EventId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get cycleId(): CycleId {
    return this._props.cycleId;
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

  get start(): Instant {
    return this._props.start;
  }

  get end(): Instant {
    return this._props.end;
  }

  get status(): EventStatus {
    return this._props.status;
  }

  public markScheduled(): void {
    this._props.status = 'scheduled';
    this._updatedAt = toDate({ instant: now() });
  }

  public cancel(): void {
    this._props.status = 'cancelled';
    this._updatedAt = toDate({ instant: now() });
  }

  public markAsPast(): void {
    this._props.status = 'past';
    this._updatedAt = toDate({ instant: now() });
  }
}
