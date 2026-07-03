import { Entity, type LooseProps } from '@church/core';
import type { ChurchId, PlanningCycleId } from '../branded-ids';
import { IllegalStateTransitionError } from '../errors/illegal-state-transition';
import { DateRange } from '../value-objects/date-range';

const ONE_DAY_IN_MS = 86_400_000;

export const PLANNING_CYCLE_STATE_OPTIONS = [
  'draft',
  'locked',
  'archived',
] as const;
export type PlanningCycleState = (typeof PLANNING_CYCLE_STATE_OPTIONS)[number];

export interface PlanningCycleProps {
  churchId: ChurchId;
  name: string;
  startDate: Date;
  endDate: Date;
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
  date: Date;
  timeZone: string;
}

export class PlanningCycle extends Entity<PlanningCycleProps, PlanningCycleId> {
  constructor({ props, id, createdAt, updatedAt }: PlanningCycleInput) {
    const normalizedProps = {
      ...props,
      state: props.state ?? 'draft',
    } as PlanningCycleProps;

    DateRange.create({
      start: normalizedProps.startDate,
      end: normalizedProps.endDate,
    });

    super(normalizedProps, id as PlanningCycleId, createdAt, updatedAt);
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get name(): string {
    return this._props.name;
  }

  get startDate(): Date {
    return this._props.startDate;
  }

  get endDate(): Date {
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
    this._updatedAt = new Date();
  }

  archive(): void {
    if (this.state === 'archived') {
      throw new IllegalStateTransitionError(this.state, 'archived');
    }

    this._props.state = 'archived';
    this._updatedAt = new Date();
  }

  assertCanReopenEvent({ eventState }: PlanningCycleCanReopenEventInput): void {
    if (this.state !== 'locked') {
      throw new IllegalStateTransitionError(this.state, 'reopen_event');
    }

    if (eventState === 'cancelled' || eventState === 'past') {
      throw new IllegalStateTransitionError(eventState, 'draft');
    }
  }

  containsDate({ date, timeZone }: PlanningCycleContainsDateInput): boolean {
    const range = DateRange.create({
      start: normalizeStoredDate({ date: this.startDate }),
      end: normalizeStoredDate({ date: this.endDate }),
    });
    const normalizedDate = DateRange.createDateOnly({
      start: date,
      end: new Date(date.getTime() + ONE_DAY_IN_MS),
      timeZone,
    }).start;

    return normalizedDate >= range.start && normalizedDate < range.end;
  }
}

interface NormalizeStoredDateInput {
  date: Date;
}

function normalizeStoredDate({ date }: NormalizeStoredDateInput): Date {
  const isoDate = date.toISOString().slice(0, 10);
  return new Date(`${isoDate}T00:00:00.000Z`);
}
