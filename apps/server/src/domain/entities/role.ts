import { type BrandedId, Entity } from '@church/core';
import type { ChurchId } from './church';
import type { MinistryId } from './ministry';

export type RoleId = BrandedId<'RoleId'>;

export interface RoleProps {
  churchId: ChurchId;
  ministryId?: MinistryId;
  name: string;
  isGlobal: boolean;
}

export class Role extends Entity<RoleProps, RoleId> {
  constructor(
    props: Omit<RoleProps, 'isGlobal'> & Partial<Pick<RoleProps, 'isGlobal'>>,
    id?: RoleId,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        isGlobal: props.isGlobal ?? false,
      },
      id,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get ministryId(): MinistryId | undefined {
    return this._props.ministryId;
  }

  get name(): string {
    return this._props.name;
  }

  get isGlobal(): boolean {
    return this._props.isGlobal;
  }
}
