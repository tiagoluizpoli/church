import { Entity, type LooseProps } from '@church/core';
import {
  type CalendarDay,
  compareCalendarDays,
  type Instant,
  now,
  toDate,
  today,
} from '@church/time';
import type { ChurchId, PlanningCycleId } from '../branded-ids';
import { IllegalStateTransitionError } from '../errors/illegal-state-transition';
import { InvalidDateRangeError } from '../errors/invalid-date-range';

export const PLANNING_CYCLE_STATE_OPTIONS = [
  'draft',
  'locked',
  'archived',
] as const;
export type PlanningCycleState = (typeof PLANNING_CYCLE_STATE_OPTIONS)[number];

export interface PlanningCycleProps {
  churchId: ChurchId;
  name: string;
  startDate: CalendarDay;
  endDate: CalendarDay;
  state: PlanningCycleState;
}

export interface PlanningCycleInput {
  props: Omit<LooseProps<PlanningCycleProps>, 'state'> &
    Partial<Pick<LooseProps<PlanningCycleProps>, 'state'>>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PlanningCycleCanReopenEventInput {
  eventState: 'draft' | 'scheduled' | 'cancelled' | 'past';
}

export interface PlanningCycleContainsDateInput {
  instant: Instant;
  timeZone: string;
}

export class PlanningCycle extends Entity<PlanningCycleProps, PlanningCycleId> {
  constructor({ props, id, createdAt, updatedAt }: PlanningCycleInput) {
    const normalizedProps = {
      ...props,
      state: props.state ?? 'draft',
    } as PlanningCycleProps;

    if (
      compareCalendarDays({
        left: normalizedProps.startDate,
        right: normalizedProps.endDate,
      }) >= 0
    ) {
      throw new InvalidDateRangeError();
    }

    super(normalizedProps, id as PlanningCycleId, createdAt, updatedAt);
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get name(): string {
    return this._props.name;
  }

  get startDate(): CalendarDay {
    return this._props.startDate;
  }

  get endDate(): CalendarDay {
    return this._props.endDate;
  }

  get state(): PlanningCycleState {
    return this._props.state;
  }

  lock(): void {
    if (this.state !== 'draft') {
      throw new IllegalStateTransitionError(this.state, 'locked');
    }

    this._props.state = 'locked';
    this._updatedAt = toDate({ instant: now() });
  }

  archive(): void {
    if (this.state === 'archived') {
      throw new IllegalStateTransitionError(this.state, 'archived');
    }

    this._props.state = 'archived';
    this._updatedAt = toDate({ instant: now() });
  }

  assertCanReopenEvent({ eventState }: PlanningCycleCanReopenEventInput): void {
    if (this.state !== 'locked') {
      throw new IllegalStateTransitionError(this.state, 'reopen_event');
    }

    if (eventState === 'cancelled' || eventState === 'past') {
      throw new IllegalStateTransitionError(eventState, 'draft');
    }
  }

  containsDate({ instant, timeZone }: PlanningCycleContainsDateInput): boolean {
    const day = today({ instant, timeZone });
    return (
      compareCalendarDays({ left: day, right: this.startDate }) >= 0 &&
      compareCalendarDays({ left: day, right: this.endDate }) < 0
    );
  }
}
