import { Entity, type LooseProps } from '@church/core';
import {
  type CalendarDay,
  compareCalendarDays,
  type Instant,
  now,
  toDate,
  today,
} from '@church/time';
import type { ChurchId, CycleId } from '../branded-ids';
import { IllegalStateTransitionError } from '../errors/illegal-state-transition';
import { InvalidDateRangeError } from '../errors/invalid-date-range';

export const CYCLE_STATE_OPTIONS = ['draft', 'sent', 'past'] as const;
export type CycleState = (typeof CYCLE_STATE_OPTIONS)[number];

export interface CycleProps {
  churchId: ChurchId;
  name: string;
  startDate: CalendarDay;
  endDate: CalendarDay;
  state: CycleState;
}

export interface CycleInput {
  props: Omit<LooseProps<CycleProps>, 'state'> &
    Partial<Pick<LooseProps<CycleProps>, 'state'>>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CycleCanReopenEventInput {
  eventState: 'draft' | 'scheduled' | 'cancelled' | 'past';
}

export interface CycleContainsDateInput {
  instant: Instant;
  timeZone: string;
}

export class Cycle extends Entity<CycleProps, CycleId> {
  constructor({ props, id, createdAt, updatedAt }: CycleInput) {
    const normalizedProps = {
      ...props,
      state: props.state ?? 'draft',
    } as CycleProps;

    if (
      compareCalendarDays({
        left: normalizedProps.startDate,
        right: normalizedProps.endDate,
      }) >= 0
    ) {
      throw new InvalidDateRangeError();
    }

    super(normalizedProps, id as CycleId, createdAt, updatedAt);
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

  get state(): CycleState {
    return this._props.state;
  }

  send(): void {
    if (this.state !== 'draft') {
      throw new IllegalStateTransitionError({ from: this.state, to: 'sent' });
    }

    this._props.state = 'sent';
    this._updatedAt = toDate({ instant: now() });
  }

  markPast(): void {
    if (this.state === 'past') {
      throw new IllegalStateTransitionError({ from: this.state, to: 'past' });
    }

    this._props.state = 'past';
    this._updatedAt = toDate({ instant: now() });
  }

  assertCanReopenEvent({ eventState }: CycleCanReopenEventInput): void {
    if (this.state !== 'sent') {
      throw new IllegalStateTransitionError({
        from: this.state,
        to: 'reopen_event',
      });
    }

    if (eventState === 'cancelled' || eventState === 'past') {
      throw new IllegalStateTransitionError({ from: eventState, to: 'draft' });
    }
  }

  containsDate({ instant, timeZone }: CycleContainsDateInput): boolean {
    const day = today({ instant, timeZone });
    return (
      compareCalendarDays({ left: day, right: this.startDate }) >= 0 &&
      compareCalendarDays({ left: day, right: this.endDate }) < 0
    );
  }
}
