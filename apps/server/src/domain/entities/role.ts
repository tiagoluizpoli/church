import { Entity, type LooseProps } from '@church/core';
import type { ChurchId, MinistryId, RoleId } from '../branded-ids';

export interface RoleProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
}

export class Role extends Entity<RoleProps, RoleId> {
  constructor(
    props: LooseProps<RoleProps>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(props as RoleProps, id as RoleId, createdAt, updatedAt);
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get ministryId(): MinistryId {
    return this._props.ministryId;
  }

  get name(): string {
    return this._props.name;
  }
}
