import { type BrandedId, Entity } from '@church/core';
import type { ChurchId } from './church';

export type MinistryId = BrandedId<'MinistryId'>;

export const ENFORCEMENT_TYPE_OPTIONS = ['soft', 'hard'] as const;
export type EnforcementType = (typeof ENFORCEMENT_TYPE_OPTIONS)[number];

export interface MinistrySettings {
  enforcementType: EnforcementType;
}

export interface MinistryProps {
  churchId: ChurchId;
  name: string;
  description?: string;
  enforcementType: EnforcementType;
  deletedAt?: Date;
}

export class Ministry extends Entity<MinistryProps, MinistryId> {
  constructor(
    props: Omit<MinistryProps, 'enforcementType'> &
      Partial<Pick<MinistryProps, 'enforcementType'>>,
    id?: MinistryId,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        enforcementType: props.enforcementType ?? 'soft',
      },
      id,
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

  get deletedAt(): Date | undefined {
    return this._props.deletedAt;
  }

  public softDelete(): void {
    this._props.deletedAt = new Date();
    this._updatedAt = new Date();
  }
}
