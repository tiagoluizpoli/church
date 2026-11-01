import { Entity, type LooseProps } from '@church/core';
import type { ChurchId, EventTemplateId } from '../branded-ids';
import { InvalidWeekdayError } from '../errors/invalid-weekday';
import type { TemplateTimeBlock } from './template-time-block';

export interface EventTemplateProps {
  churchId: ChurchId;
  name: string;
  weekday: number;
  blocks: TemplateTimeBlock[];
}

export interface EventTemplateInput {
  props: LooseProps<EventTemplateProps>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TemplateTimeBlockUsage {
  blockId: string;
  ministryCount: number;
}

/** Distinct Ministries with Usual setup per block and across the template. */
export interface EventTemplateUsage {
  templateId: EventTemplateId;
  ministryCount: number;
  blocks: TemplateTimeBlockUsage[];
}

export class EventTemplate extends Entity<EventTemplateProps, EventTemplateId> {
  constructor({ props, id, createdAt, updatedAt }: EventTemplateInput) {
    if (props.weekday < 0 || props.weekday > 6) {
      throw new InvalidWeekdayError();
    }

    super({
      props: {
        ...props,
        blocks: [...props.blocks].sort(
          (left, right) => left.order - right.order,
        ),
      } as EventTemplateProps,
      id: id as EventTemplateId,
      createdAt,
      updatedAt,
    });
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get name(): string {
    return this._props.name;
  }

  get weekday(): number {
    return this._props.weekday;
  }

  get blocks(): TemplateTimeBlock[] {
    return this._props.blocks;
  }
}
