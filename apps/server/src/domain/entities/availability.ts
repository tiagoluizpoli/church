import { Entity, type LooseProps } from '@church/core';
import { compareInstants, type Instant } from '@church/time';
import type {
  AvailabilityCheckId,
  AvailabilityId,
  ChurchId,
  ShiftId,
  VolunteerId,
} from '../branded-ids';
import { InvalidTimeRangeError } from '../errors/invalid-time-range';

/**
 * Unavailability mark: its existence means the volunteer is unavailable for
 * the shift. A volunteer with no marks is available by default (FR-018).
 * `volunteerId` and the shift times are denormalized from the repository join
 * (the row itself stores only check + shift keys).
 */
export interface AvailabilityProps {
  churchId: ChurchId;
  availabilityCheckId: AvailabilityCheckId;
  shiftId: ShiftId;
  volunteerId: VolunteerId;
  shiftStartTime: Instant;
  shiftEndTime: Instant;
}

export interface AvailabilityInput {
  props: LooseProps<AvailabilityProps>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Availability extends Entity<AvailabilityProps, AvailabilityId> {
  constructor({ props, id, createdAt, updatedAt }: AvailabilityInput) {
    if (
      compareInstants({
        left: props.shiftStartTime as Instant,
        right: props.shiftEndTime as Instant,
      }) >= 0
    ) {
      throw new InvalidTimeRangeError();
    }
    super(
      props as AvailabilityProps,
      id as AvailabilityId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get availabilityCheckId(): AvailabilityCheckId {
    return this._props.availabilityCheckId;
  }

  get shiftId(): ShiftId {
    return this._props.shiftId;
  }

  get volunteerId(): VolunteerId {
    return this._props.volunteerId;
  }

  get shiftStartTime(): Instant {
    return this._props.shiftStartTime;
  }

  get shiftEndTime(): Instant {
    return this._props.shiftEndTime;
  }
}
