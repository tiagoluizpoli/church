import { Entity, type LooseProps } from '@church/core';
import { compareInstants, type Instant, now, toDate } from '@church/time';
import type {
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
  ShiftId,
} from '../branded-ids';
import { InvalidTimeRangeError } from '../errors/invalid-time-range';
import { ShiftOutOfBoundsError } from '../errors/shift-out-of-bounds';

export interface ShiftProps {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  eventTimeBlockId: EventTimeBlockId;
  startTime: Instant;
  endTime: Instant;
  label?: string;
}

export interface ShiftEventTimeBlockBounds {
  startTime: Instant;
  endTime: Instant;
}

export interface ShiftInput {
  props: LooseProps<ShiftProps>;
  /** When provided (creation path), the shift must lie entirely within these bounds. */
  eventTimeBlockBounds?: ShiftEventTimeBlockBounds;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ShiftUpdateBoundsInput {
  startTime: Instant;
  endTime: Instant;
  eventTimeBlockBounds: ShiftEventTimeBlockBounds;
}

export class Shift extends Entity<ShiftProps, ShiftId> {
  constructor({
    props,
    eventTimeBlockBounds,
    id,
    createdAt,
    updatedAt,
  }: ShiftInput) {
    assertShiftWithinBounds({
      startTime: props.startTime as Instant,
      endTime: props.endTime as Instant,
      eventTimeBlockBounds,
    });

    super(props as ShiftProps, id as ShiftId, createdAt, updatedAt);
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get participationId(): MinistryParticipationId {
    return this._props.participationId;
  }

  get eventTimeBlockId(): EventTimeBlockId {
    return this._props.eventTimeBlockId;
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

  updateBounds({
    startTime,
    endTime,
    eventTimeBlockBounds,
  }: ShiftUpdateBoundsInput): void {
    assertShiftWithinBounds({ startTime, endTime, eventTimeBlockBounds });
    this._props.startTime = startTime;
    this._props.endTime = endTime;
    this._updatedAt = toDate({ instant: now() });
  }

  updateLabel(label: string | undefined): void {
    this._props.label = label;
    this._updatedAt = toDate({ instant: now() });
  }
}

interface AssertShiftWithinBoundsInput {
  startTime: Instant;
  endTime: Instant;
  eventTimeBlockBounds?: ShiftEventTimeBlockBounds;
}

function assertShiftWithinBounds({
  startTime,
  endTime,
  eventTimeBlockBounds,
}: AssertShiftWithinBoundsInput): void {
  if (compareInstants({ left: startTime, right: endTime }) >= 0) {
    throw new InvalidTimeRangeError();
  }

  if (!eventTimeBlockBounds) {
    return;
  }

  if (
    compareInstants({
      left: startTime,
      right: eventTimeBlockBounds.startTime,
    }) < 0 ||
    compareInstants({ left: endTime, right: eventTimeBlockBounds.endTime }) > 0
  ) {
    throw new ShiftOutOfBoundsError();
  }
}
