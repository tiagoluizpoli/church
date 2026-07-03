import { Entity, type LooseProps } from '@church/core';
import type { ChurchId, EventTemplateId } from '../branded-ids';
import { InvalidWeekdayError } from '../errors/invalid-weekday';
import type { TimeBlock } from './time-block';

export interface EventTemplateProps {
  churchId: ChurchId;
  name: string;
  weekday: number;
  blocks: TimeBlock[];
}

export interface EventTemplateInput {
  props: LooseProps<EventTemplateProps>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class EventTemplate extends Entity<EventTemplateProps, EventTemplateId> {
  constructor({ props, id, createdAt, updatedAt }: EventTemplateInput) {
    if (props.weekday < 0 || props.weekday > 6) {
      throw new InvalidWeekdayError();
    }

    super(
      {
        ...props,
        blocks: [...props.blocks].sort(
          (left, right) => left.order - right.order,
        ),
      } as EventTemplateProps,
      id as EventTemplateId,
      createdAt,
      updatedAt,
    );
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

  get blocks(): TimeBlock[] {
    return this._props.blocks;
  }
}
