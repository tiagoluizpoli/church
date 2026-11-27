import { Entity, type LooseProps } from '@church/core';
import { compareInstants, type Instant, now, toDate } from '@church/time';
import type {
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  MinistryId,
} from '../branded-ids';
import { IllegalStateTransitionError } from '../errors/illegal-state-transition';
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
  /** Only ever true on a cancelled Event. */
  isHidden: boolean;
}

export interface EventWithEventTimeBlocks {
  event: Event;
  eventTimeBlocks: EventTimeBlock[];
}

export interface EventInput {
  props:
    | (Omit<LooseProps<EventProps>, 'status' | 'isHidden'> &
        Partial<Pick<LooseProps<EventProps>, 'status' | 'isHidden'>>)
    | (Omit<
        LooseProps<EventProps>,
        'cycleId' | 'sourceTemplateId' | 'status' | 'isHidden'
      > & {
        ministryId: MinistryId | string;
      } & Partial<Pick<LooseProps<EventProps>, 'status' | 'isHidden'>>);
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface SetHiddenInput {
  isHidden: boolean;
  action: 'hide' | 'show';
}

export class Event extends Entity<EventProps, EventId> {
  constructor({ props, id, createdAt, updatedAt }: EventInput) {
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
    super({
      props: {
        ...normalizedProps,
        status: props.status ?? 'draft',
        isHidden: props.isHidden ?? false,
      } as EventProps,
      id: id as EventId,
      createdAt,
      updatedAt,
    });
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

  get isHidden(): boolean {
    return this._props.isHidden;
  }

  public markScheduled(): void {
    this._props.status = 'scheduled';
    this._updatedAt = toDate({ instant: now() });
  }

  public cancel(): void {
    this._props.status = 'cancelled';
    this._updatedAt = toDate({ instant: now() });
  }

  /** Only cancelled work can be hidden or shown again. */
  public hide(): void {
    this.setHidden({ isHidden: true, action: 'hide' });
  }

  public show(): void {
    this.setHidden({ isHidden: false, action: 'show' });
  }

  private setHidden({ isHidden, action }: SetHiddenInput): void {
    const { status } = this._props;
    if (status !== 'cancelled') {
      throw new IllegalStateTransitionError({ from: status, to: action });
    }
    this._props.isHidden = isHidden;
    this._updatedAt = toDate({ instant: now() });
  }

  public markAsPast(): void {
    this._props.status = 'past';
    this._updatedAt = toDate({ instant: now() });
  }
}
