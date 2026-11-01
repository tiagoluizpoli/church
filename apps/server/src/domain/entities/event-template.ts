import { Entity, type LooseProps } from '@church/core';
import type {
  ChurchId,
  EventTemplateId,
  TemplateTimeBlockId,
} from '../branded-ids';
import { DuplicateTemplateBlockLabelError } from '../errors/duplicate-template-block-label';
import { InvalidTimeRangeError } from '../errors/invalid-time-range';
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
  blockId: TemplateTimeBlockId;
  ministryCount: number;
}

/** Distinct Ministries with Usual setup per block and across the template. */
export interface EventTemplateUsage {
  templateId: EventTemplateId;
  ministryCount: number;
  blocks: TemplateTimeBlockUsage[];
}

/** The parts of a block the template-level rules read. */
export interface TemplateBlockRuleShape {
  label: string;
  startTime: string;
  endTime: string;
}

export interface AssertTemplateBlocksInput {
  blocks: TemplateBlockRuleShape[];
}

export class EventTemplate extends Entity<EventTemplateProps, EventTemplateId> {
  /** Every block is non-empty and no two blocks share a label, ignoring case. */
  static assertBlocks({ blocks }: AssertTemplateBlocksInput): void {
    const labels = new Set<string>();
    for (const block of blocks) {
      if (block.startTime === block.endTime) {
        throw new InvalidTimeRangeError('Start time must not equal end time');
      }
      const labelKey = block.label.toLowerCase();
      if (labels.has(labelKey)) {
        throw new DuplicateTemplateBlockLabelError();
      }
      labels.add(labelKey);
    }
  }

  constructor({ props, id, createdAt, updatedAt }: EventTemplateInput) {
    if (props.weekday < 0 || props.weekday > 6) {
      throw new InvalidWeekdayError();
    }
    EventTemplate.assertBlocks({ blocks: props.blocks });

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
