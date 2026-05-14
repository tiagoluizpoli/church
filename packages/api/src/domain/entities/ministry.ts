import { Entity } from '@church/core';

export const ENFORCEMENT_TYPE_OPTIONS = ['soft', 'hard'] as const;
export type EnforcementType = (typeof ENFORCEMENT_TYPE_OPTIONS)[number];

export interface MinistryProps {
  churchId: string;
  name: string;
  description?: string;
  enforcementType: EnforcementType;
  deletedAt?: Date;
}

export class Ministry extends Entity<MinistryProps> {
  constructor(
    props: Omit<MinistryProps, 'enforcementType'> &
      Partial<Pick<MinistryProps, 'enforcementType'>>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        enforcementType: props.enforcementType ?? 'soft',
        deletedAt: props.deletedAt ?? undefined, // Normalize null to undefined or keep it. Data model says Date? meaning Date | undefined | null. We'll use nullable for consistency. Let's just keep whatever is passed, default undefined.
      },
      id,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): string {
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
