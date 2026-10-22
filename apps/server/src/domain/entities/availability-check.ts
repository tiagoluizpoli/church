import { Entity, type LooseProps } from '@church/core';
import { type Instant, now, toDate } from '@church/time';
import type { AvailabilityCheckId, ChurchId, CycleId } from '../branded-ids';
import { IllegalStateTransitionError } from '../errors/illegal-state-transition';

export const AVAILABILITY_CHECK_STATE_OPTIONS = [
  'pending',
  'confirmed',
] as const;
export type AvailabilityCheckState =
  (typeof AVAILABILITY_CHECK_STATE_OPTIONS)[number];

export interface AvailabilityCheckProps {
  churchId: ChurchId;
  cycleId: CycleId;
  /** Ministry membership (ministry_membership row) this check targets. */
  ministryMembershipId: string;
  state: AvailabilityCheckState;
  confirmedAt?: Instant;
}

export interface AvailabilityCheckInput {
  props: Omit<LooseProps<AvailabilityCheckProps>, 'state'> &
    Partial<Pick<LooseProps<AvailabilityCheckProps>, 'state'>>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class AvailabilityCheck extends Entity<
  AvailabilityCheckProps,
  AvailabilityCheckId
> {
  constructor({ props, id, createdAt, updatedAt }: AvailabilityCheckInput) {
    super({
      props: {
        ...props,
        state: props.state ?? 'pending',
      } as AvailabilityCheckProps,
      id: id as AvailabilityCheckId,
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

  get ministryMembershipId(): string {
    return this._props.ministryMembershipId;
  }

  get state(): AvailabilityCheckState {
    return this._props.state;
  }

  get confirmedAt(): Instant | undefined {
    return this._props.confirmedAt;
  }

  /** Confirm gate: valid even with zero unavailable shifts (FR-019). */
  confirm(): void {
    if (this.state !== 'pending') {
      throw new IllegalStateTransitionError(this.state, 'confirmed');
    }

    this._props.state = 'confirmed';
    this._props.confirmedAt = now();
    this._updatedAt = toDate({ instant: now() });
  }
}
