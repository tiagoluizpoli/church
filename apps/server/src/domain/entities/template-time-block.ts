import { Entity, type LooseProps } from '@church/core';
import type { TimeOfDay } from '@church/time';
import type {
  ChurchId,
  EventTemplateId,
  TemplateTimeBlockId,
} from '../branded-ids';
import { InvalidTimeRangeError } from '../errors/invalid-time-range';

export interface TemplateTimeBlockProps {
  churchId: ChurchId;
  templateId: EventTemplateId;
  label: string;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  order: number;
}

export interface TemplateTimeBlockInput {
  props: LooseProps<TemplateTimeBlockProps>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class TemplateTimeBlock extends Entity<
  TemplateTimeBlockProps,
  TemplateTimeBlockId
> {
  constructor({ props, id, createdAt, updatedAt }: TemplateTimeBlockInput) {
    // An end before its start crosses midnight onto the next CalendarDay
    // (ADR-0003); only a zero-length block is invalid.
    if (props.startTime === props.endTime) {
      throw new InvalidTimeRangeError('Start time must not equal end time');
    }

    super({
      props: props as TemplateTimeBlockProps,
      id: id as TemplateTimeBlockId,
      createdAt,
      updatedAt,
    });
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get templateId(): EventTemplateId {
    return this._props.templateId;
  }

  get label(): string {
    return this._props.label;
  }

  get startTime(): TimeOfDay {
    return this._props.startTime;
  }

  get endTime(): TimeOfDay {
    return this._props.endTime;
  }

  get order(): number {
    return this._props.order;
  }
}
