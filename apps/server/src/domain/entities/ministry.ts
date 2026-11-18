import { Entity, type LooseProps } from '@church/core';
import { type Instant, now, toDate } from '@church/time';
import type { ChurchId, MinistryId } from '../branded-ids';

export const DEFAULT_DIRECTION_OPTIONS = ['all_in', 'all_out'] as const;
export type DefaultDirection = (typeof DEFAULT_DIRECTION_OPTIONS)[number];

/** Ministries management list filter: every Ministry, those needing review, or those without active Sectors. */
export const MINISTRY_LIST_STATUS_OPTIONS = [
  'any',
  'review',
  'no-sectors',
] as const;
export type MinistryListStatus = (typeof MINISTRY_LIST_STATUS_OPTIONS)[number];

/** Ministries in the caller's whole scope; the filters and the cursor never apply. */
export interface MinistryListCounts {
  total: number;
  review: number;
  noSectors: number;
}

export interface MinistrySettings {
  defaultDirection: DefaultDirection;
}

export interface MinistryProps {
  churchId: ChurchId;
  name: string;
  description?: string;
  defaultDirection: DefaultDirection;
  deletedAt?: Instant;
}

export interface MinistryInput {
  props: Omit<LooseProps<MinistryProps>, 'defaultDirection'> &
    Partial<Pick<LooseProps<MinistryProps>, 'defaultDirection'>>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Ministry extends Entity<MinistryProps, MinistryId> {
  constructor({ props, id, createdAt, updatedAt }: MinistryInput) {
    super({
      props: {
        ...props,
        defaultDirection: props.defaultDirection ?? 'all_out',
      } as MinistryProps,
      id: id as MinistryId,
      createdAt,
      updatedAt,
    });
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get name(): string {
    return this._props.name;
  }

  get description(): string | undefined {
    return this._props.description;
  }

  get defaultDirection(): DefaultDirection {
    return this._props.defaultDirection;
  }

  get deletedAt(): Instant | undefined {
    return this._props.deletedAt;
  }

  public softDelete(): void {
    this._props.deletedAt = now();
    this._updatedAt = toDate({ instant: now() });
  }
}
