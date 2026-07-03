import { Entity, type LooseProps } from '@church/core';
import type { ChurchId, EventTemplateId, TimeBlockId } from '../branded-ids';
import { InvalidTimeRangeError } from '../errors/invalid-time-range';

export interface TimeBlockProps {
  churchId: ChurchId;
  templateId: EventTemplateId;
  label: string;
  startTime: string;
  endTime: string;
  order: number;
}

export interface TimeBlockInput {
  props: LooseProps<TimeBlockProps>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class TimeBlock extends Entity<TimeBlockProps, TimeBlockId> {
  constructor({ props, id, createdAt, updatedAt }: TimeBlockInput) {
    if (props.startTime >= props.endTime) {
      throw new InvalidTimeRangeError();
    }

    super(props as TimeBlockProps, id as TimeBlockId, createdAt, updatedAt);
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

  get startTime(): string {
    return this._props.startTime;
  }

  get endTime(): string {
    return this._props.endTime;
  }

  get order(): number {
    return this._props.order;
  }
}
