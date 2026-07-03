import { Entity, type LooseProps } from '@church/core';
import type {
  ChurchId,
  MinistryParticipationId,
  ShiftId,
  TimeSlotId,
} from '../branded-ids';
import { InvalidTimeRangeError } from '../errors/invalid-time-range';
import { ShiftOutOfBoundsError } from '../errors/shift-out-of-bounds';

export interface ShiftProps {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  timeSlotId: TimeSlotId;
  startTime: Date;
  endTime: Date;
  label?: string;
}

export interface ShiftSlotBounds {
  startTime: Date;
  endTime: Date;
}

export interface ShiftInput {
  props: LooseProps<ShiftProps>;
  /** When provided (creation path), the shift must lie entirely within these bounds. */
  slotBounds?: ShiftSlotBounds;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ShiftUpdateBoundsInput {
  startTime: Date;
  endTime: Date;
  slotBounds: ShiftSlotBounds;
}

export class Shift extends Entity<ShiftProps, ShiftId> {
  constructor({ props, slotBounds, id, createdAt, updatedAt }: ShiftInput) {
    assertShiftWithinBounds({
      startTime: props.startTime,
      endTime: props.endTime,
      slotBounds,
    });

    super(props as ShiftProps, id as ShiftId, createdAt, updatedAt);
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get participationId(): MinistryParticipationId {
    return this._props.participationId;
  }

  get timeSlotId(): TimeSlotId {
    return this._props.timeSlotId;
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

  updateBounds({
    startTime,
    endTime,
    slotBounds,
  }: ShiftUpdateBoundsInput): void {
    assertShiftWithinBounds({ startTime, endTime, slotBounds });
    this._props.startTime = startTime;
    this._props.endTime = endTime;
    this._updatedAt = new Date();
  }

  updateLabel(label: string | undefined): void {
    this._props.label = label;
    this._updatedAt = new Date();
  }
}

interface AssertShiftWithinBoundsInput {
  startTime: Date;
  endTime: Date;
  slotBounds?: ShiftSlotBounds;
}

function assertShiftWithinBounds({
  startTime,
  endTime,
  slotBounds,
}: AssertShiftWithinBoundsInput): void {
  if (startTime >= endTime) {
    throw new InvalidTimeRangeError();
  }

  if (!slotBounds) {
    return;
  }

  if (startTime < slotBounds.startTime || endTime > slotBounds.endTime) {
    throw new ShiftOutOfBoundsError();
  }
}
