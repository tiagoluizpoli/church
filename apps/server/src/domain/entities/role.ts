import { Entity, type LooseProps } from '@church/core';
import { RoleId } from '../branded-ids/role-id';
import type { ChurchId } from './church';
import type { MinistryId } from './ministry';

export { RoleId };

export interface RoleProps {
  churchId: ChurchId;
  ministryId?: MinistryId;
  name: string;
  isGlobal: boolean;
}

export class Role extends Entity<RoleProps, RoleId> {
  constructor(
    props: Omit<LooseProps<RoleProps>, 'isGlobal'> &
      Partial<Pick<LooseProps<RoleProps>, 'isGlobal'>>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        isGlobal: props.isGlobal ?? false,
      } as RoleProps,
      id as RoleId,
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
