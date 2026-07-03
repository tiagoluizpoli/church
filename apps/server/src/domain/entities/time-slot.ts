import { Entity, type LooseProps } from '@church/core';
import type {
  ChurchId,
  EventId,
  TimeBlockId,
  TimeSlotId,
} from '../branded-ids';
import { InvalidDateRangeError } from '../errors/invalid-date-range';
import type { SlotRequirement } from './slot-requirement';

export const TIME_SLOT_STATUS_OPTIONS = ['active', 'cancelled'] as const;
export type TimeSlotStatus = (typeof TIME_SLOT_STATUS_OPTIONS)[number];

export interface TimeSlotProps {
  churchId: ChurchId;
  eventId: EventId;
  sourceTemplateBlockId?: TimeBlockId;
  startTime: Date;
  endTime: Date;
  label?: string;
  status: TimeSlotStatus;
  requirements: SlotRequirement[];
}

export class TimeSlot extends Entity<TimeSlotProps, TimeSlotId> {
  constructor(
    props: Omit<LooseProps<TimeSlotProps>, 'status' | 'requirements'> &
      Partial<Pick<LooseProps<TimeSlotProps>, 'status' | 'requirements'>>,
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
        requirements: props.requirements ?? [],
      } as unknown as TimeSlotProps,
      id as TimeSlotId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get eventId(): EventId {
    return this._props.eventId;
  }

  get sourceTemplateBlockId(): TimeBlockId | undefined {
    return this._props.sourceTemplateBlockId;
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

  get requirements(): SlotRequirement[] {
    return this._props.requirements;
  }

  public cancel(): void {
    this._props.status = 'cancelled';
    this._updatedAt = new Date();
  }
}
