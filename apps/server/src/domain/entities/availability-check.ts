import { Entity, type LooseProps } from '@church/core';
import type {
  AvailabilityCheckId,
  ChurchId,
  PlanningCycleId,
} from '../branded-ids';
import { IllegalStateTransitionError } from '../errors/illegal-state-transition';

export const AVAILABILITY_CHECK_STATE_OPTIONS = [
  'pending',
  'confirmed',
] as const;
export type AvailabilityCheckState =
  (typeof AVAILABILITY_CHECK_STATE_OPTIONS)[number];

export interface AvailabilityCheckProps {
  churchId: ChurchId;
  planningCycleId: PlanningCycleId;
  /** Ministry membership (ministry_volunteer row) this check targets. */
  ministryVolunteerId: string;
  state: AvailabilityCheckState;
  confirmedAt?: Date;
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
    super(
      {
        ...props,
        state: props.state ?? 'pending',
      } as AvailabilityCheckProps,
      id as AvailabilityCheckId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get planningCycleId(): PlanningCycleId {
    return this._props.planningCycleId;
  }

  get ministryVolunteerId(): string {
    return this._props.ministryVolunteerId;
  }

  get state(): AvailabilityCheckState {
    return this._props.state;
  }

  get confirmedAt(): Date | undefined {
    return this._props.confirmedAt;
  }

  /** Confirm gate: valid even with zero unavailability marks (FR-019). */
  confirm(): void {
    if (this.state !== 'pending') {
      throw new IllegalStateTransitionError(this.state, 'confirmed');
    }

    this._props.state = 'confirmed';
    this._props.confirmedAt = new Date();
    this._updatedAt = new Date();
  }
}
