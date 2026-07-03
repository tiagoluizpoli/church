import { Entity, type LooseProps } from '@church/core';
import type { ChurchId, MinistryId } from '../branded-ids';

export const ENFORCEMENT_TYPE_OPTIONS = ['soft', 'hard'] as const;
export type EnforcementType = (typeof ENFORCEMENT_TYPE_OPTIONS)[number];

export const DEFAULT_DIRECTION_OPTIONS = ['all_in', 'all_out'] as const;
export type DefaultDirection = (typeof DEFAULT_DIRECTION_OPTIONS)[number];

export interface MinistrySettings {
  enforcementType: EnforcementType;
  defaultDirection: DefaultDirection;
}

export interface MinistryProps {
  churchId: ChurchId;
  name: string;
  description?: string;
  enforcementType: EnforcementType;
  defaultDirection: DefaultDirection;
  deletedAt?: Date;
}

export class Ministry extends Entity<MinistryProps, MinistryId> {
  constructor(
    props: Omit<
      LooseProps<MinistryProps>,
      'enforcementType' | 'defaultDirection'
    > &
      Partial<
        Pick<LooseProps<MinistryProps>, 'enforcementType' | 'defaultDirection'>
      >,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        enforcementType: props.enforcementType ?? 'soft',
        defaultDirection: props.defaultDirection ?? 'all_out',
      } as MinistryProps,
      id as MinistryId,
      createdAt,
      updatedAt,
    );
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

  get enforcementType(): EnforcementType {
    return this._props.enforcementType;
  }

  get defaultDirection(): DefaultDirection {
    return this._props.defaultDirection;
  }

  get deletedAt(): Date | undefined {
    return this._props.deletedAt;
  }

  public softDelete(): void {
    this._props.deletedAt = new Date();
    this._updatedAt = new Date();
  }
}
