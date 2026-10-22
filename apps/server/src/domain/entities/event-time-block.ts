import { Entity, type LooseProps } from '@church/core';
import { compareInstants, type Instant, now, toDate } from '@church/time';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  TemplateTimeBlockId,
} from '../branded-ids';
import { InvalidDateRangeError } from '../errors/invalid-date-range';
import type { ShiftRequirement } from './shift-requirement';

export const EVENT_TIME_BLOCK_STATUS_OPTIONS = ['active', 'cancelled'] as const;
export type EventTimeBlockStatus =
  (typeof EVENT_TIME_BLOCK_STATUS_OPTIONS)[number];

export interface EventTimeBlockProps {
  churchId: ChurchId;
  eventId: EventId;
  sourceTemplateTimeBlockId?: TemplateTimeBlockId;
  startTime: Instant;
  endTime: Instant;
  label?: string;
  status: EventTimeBlockStatus;
  requirements: ShiftRequirement[];
}

export interface EventTimeBlockInput {
  props: Omit<LooseProps<EventTimeBlockProps>, 'status' | 'requirements'> &
    Partial<Pick<LooseProps<EventTimeBlockProps>, 'status' | 'requirements'>>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class EventTimeBlock extends Entity<
  EventTimeBlockProps,
  EventTimeBlockId
> {
  constructor({ props, id, createdAt, updatedAt }: EventTimeBlockInput) {
    if (
      compareInstants({
        left: props.startTime as Instant,
        right: props.endTime as Instant,
      }) >= 0
    ) {
      throw new InvalidDateRangeError();
    }
    super({
      props: {
        ...props,
        status: props.status ?? 'active',
        requirements: props.requirements ?? [],
      } as unknown as EventTimeBlockProps,
      id: id as EventTimeBlockId,
      createdAt,
      updatedAt,
    });
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get eventId(): EventId {
    return this._props.eventId;
  }

  get sourceTemplateTimeBlockId(): TemplateTimeBlockId | undefined {
    return this._props.sourceTemplateTimeBlockId;
  }

  get startTime(): Instant {
    return this._props.startTime;
  }

  get endTime(): Instant {
    return this._props.endTime;
  }

  get label(): string | undefined {
    return this._props.label;
  }

  get status(): EventTimeBlockStatus {
    return this._props.status;
  }

  get requirements(): ShiftRequirement[] {
    return this._props.requirements;
  }

  public cancel(): void {
    this._props.status = 'cancelled';
    this._updatedAt = toDate({ instant: now() });
  }
}
