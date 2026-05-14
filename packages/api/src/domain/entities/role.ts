import { Entity } from '@church/core';

export interface RoleProps {
  churchId: string;
  ministryId?: string;
  name: string;
  isGlobal: boolean;
}

export class Role extends Entity<RoleProps> {
  constructor(
    props: Omit<RoleProps, 'isGlobal'> & Partial<Pick<RoleProps, 'isGlobal'>>,
    id?: string,
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

  get churchId(): string {
    return this._props.churchId;
  }

  get ministryId(): string | undefined {
    return this._props.ministryId;
  }

  get name(): string {
    return this._props.name;
  }

  get isGlobal(): boolean {
    return this._props.isGlobal;
  }
}
