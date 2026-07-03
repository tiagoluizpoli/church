import { Entity, type LooseProps } from '@church/core';
import type {
  ChurchId,
  EventId,
  MinistryId,
  MinistryParticipationId,
} from '../branded-ids';
import { BelowFullPublishError } from '../errors/below-full-publish';
import { IllegalStateTransitionError } from '../errors/illegal-state-transition';

export const PARTICIPATION_STATE_OPTIONS = [
  'tailoring',
  'availability_fired',
  'rostering',
  'published',
] as const;
export type ParticipationState = (typeof PARTICIPATION_STATE_OPTIONS)[number];

export interface MinistryParticipationProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  eventId: EventId;
  state: ParticipationState;
}

export interface MinistryParticipationInput {
  props: Omit<LooseProps<MinistryParticipationProps>, 'state'> &
    Partial<Pick<LooseProps<MinistryParticipationProps>, 'state'>>;
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
  requiredCount: number;
}

/** Zero required headcount counts as fully staffed (CL-022). */
export function calculateCompletionPercent({
  assignedCount,
  requiredCount,
}: CalculateCompletionPercentInput): number {
  if (requiredCount <= 0) {
    return 100;
  }

  return Math.min(100, Math.round((assignedCount / requiredCount) * 100));
}

export class MinistryParticipation extends Entity<
  MinistryParticipationProps,
  MinistryParticipationId
> {
  constructor({ props, id, createdAt, updatedAt }: MinistryParticipationInput) {
    super(
      {
        ...props,
        state: props.state ?? 'tailoring',
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

  fireAvailability(): void {
    this.transitionTo('availability_fired', 'tailoring');
  }

  startRostering(): void {
    this.transitionTo('rostering', 'availability_fired');
  }

  publish({
    completionPercent,
    confirmBelowFull,
  }: PublishParticipationInput): void {
    if (this.state !== 'rostering') {
      throw new IllegalStateTransitionError(this.state, 'published');
    }

    if (completionPercent < 100 && !confirmBelowFull) {
      throw new BelowFullPublishError();
    }

    this._props.state = 'published';
    this._updatedAt = new Date();
  }

  private transitionTo(
    next: ParticipationState,
    requiredCurrent: ParticipationState,
  ): void {
    if (this.state !== requiredCurrent) {
      throw new IllegalStateTransitionError(this.state, next);
    }

    this._props.state = next;
    this._updatedAt = new Date();
  }
}
