import { Entity, type LooseProps } from '@church/core';
import type { ChurchId, MinistryId, RoleId } from '../branded-ids';

export interface RoleProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
}

export interface RoleInput {
  props: LooseProps<RoleProps>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Role extends Entity<RoleProps, RoleId> {
  constructor({ props, id, createdAt, updatedAt }: RoleInput) {
    super({
      props: props as RoleProps,
      id: id as RoleId,
      createdAt,
      updatedAt,
    });
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
