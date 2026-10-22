import { Entity, type LooseProps } from '@church/core';
import { type Instant, now, toDate } from '@church/time';
import type {
  ChurchId,
  EventId,
  MinistryId,
  MinistryParticipationId,
} from '../branded-ids';
import { BelowFullPublishError } from '../errors/below-full-publish';
import { IllegalStateTransitionError } from '../errors/illegal-state-transition';

export const PARTICIPATION_STATE_OPTIONS = [
  'preparing',
  'availability_requested',
  'assigning',
  'published',
] as const;
export type ParticipationState = (typeof PARTICIPATION_STATE_OPTIONS)[number];

export interface MinistryParticipationProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  eventId: EventId;
  state: ParticipationState;
  touchedAt: Instant | null;
}

export interface MinistryParticipationTransitionInput {
  next: ParticipationState;
  requiredCurrent: ParticipationState;
}

export interface MinistryParticipationInput {
  props: Omit<LooseProps<MinistryParticipationProps>, 'state' | 'touchedAt'> &
    Partial<
      Pick<LooseProps<MinistryParticipationProps>, 'state' | 'touchedAt'>
    >;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PublishParticipationInput {
  completionPercent: number;
  confirmBelowFull?: boolean;
}

export interface CalculateCompletionPercentInput {
  assignedCount: number;
  peopleNeeded: number;
}

/** Zero required headcount counts as fully staffed (CL-022). */
export function calculateCompletionPercent({
  assignedCount,
  peopleNeeded,
}: CalculateCompletionPercentInput): number {
  if (peopleNeeded <= 0) {
    return 100;
  }

  return Math.min(100, Math.round((assignedCount / peopleNeeded) * 100));
}

export type CyclePrepareStatus = 'not_started' | 'in_progress' | 'published';

export interface AggregateCyclePrepareStatusInput {
  eventCount: number;
  touchedCount: number;
  publishedCount: number;
  requestedOrLaterCount: number;
}

export interface CyclePrepareStatusResult {
  status: CyclePrepareStatus;
  availabilityRequestedForAll: boolean;
  availabilityRequestedForAny: boolean;
}

/** R16: rolls up a cycle's per-event `MinistryParticipation` rows into one
 * leader-facing status using an "all participations must reach X" rule for
 * both the "Not started" and "Published" boundaries. `eventCount === 0` is
 * special-cased explicitly rather than left as an implicit vacuous-truth
 * result of reducing over an empty set — `availabilityRequestedForAll` in
 * particular would otherwise be vacuously (and wrongly) `true` for a cycle
 * the ministry has no events in (research.md R16's correction note). */
export function aggregateCyclePrepareStatus({
  eventCount,
  touchedCount,
  publishedCount,
  requestedOrLaterCount,
}: AggregateCyclePrepareStatusInput): CyclePrepareStatusResult {
  if (eventCount === 0) {
    return {
      status: 'not_started',
      availabilityRequestedForAll: false,
      availabilityRequestedForAny: false,
    };
  }

  const status: CyclePrepareStatus =
    publishedCount === eventCount
      ? 'published'
      : touchedCount === 0
        ? 'not_started'
        : 'in_progress';

  return {
    status,
    availabilityRequestedForAll: requestedOrLaterCount === eventCount,
    availabilityRequestedForAny: requestedOrLaterCount > 0,
  };
}

export class MinistryParticipation extends Entity<
  MinistryParticipationProps,
  MinistryParticipationId
> {
  constructor({ props, id, createdAt, updatedAt }: MinistryParticipationInput) {
    super(
      {
        ...props,
        state: props.state ?? 'preparing',
        touchedAt: props.touchedAt ?? null,
      } as MinistryParticipationProps,
      id as MinistryParticipationId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get ministryId(): MinistryId {
    return this._props.ministryId;
  }

  get eventId(): EventId {
    return this._props.eventId;
  }

  get state(): ParticipationState {
    return this._props.state;
  }

  get touchedAt(): Instant | null {
    return this._props.touchedAt;
  }

  /** R16: records the first time this participation is edited (inclusion/
   * split/headcount write). Guarded to set once — a no-op on every call
   * after the first, so it never overwrites the original touch time. */
  touch(): void {
    if (this._props.touchedAt !== null) return;
    this._props.touchedAt = now();
    this._updatedAt = toDate({ instant: now() });
  }

  askAvailability(): void {
    this.transitionTo({
      next: 'availability_requested',
      requiredCurrent: 'preparing',
    });
  }

  startAssigning(): void {
    this.transitionTo({
      next: 'assigning',
      requiredCurrent: 'availability_requested',
    });
  }

  publish({
    completionPercent,
    confirmBelowFull,
  }: PublishParticipationInput): void {
    if (this.state !== 'assigning') {
      throw new IllegalStateTransitionError(this.state, 'published');
    }

    if (completionPercent < 100 && !confirmBelowFull) {
      throw new BelowFullPublishError();
    }

    this._props.state = 'published';
    this._updatedAt = toDate({ instant: now() });
  }

  private transitionTo({
    next,
    requiredCurrent,
  }: MinistryParticipationTransitionInput): void {
    if (this.state !== requiredCurrent) {
      throw new IllegalStateTransitionError(this.state, next);
    }

    this._props.state = next;
    this._updatedAt = toDate({ instant: now() });
  }
}
