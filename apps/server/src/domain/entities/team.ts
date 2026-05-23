import { Entity } from '@church/core';

export interface TeamProps {
  churchId: string;
  ministryId: string;
  name: string;
}

export class Team extends Entity<TeamProps> {
  get churchId(): string {
    return this._props.churchId;
  }

  get ministryId(): string {
    return this._props.ministryId;
  }

  get name(): string {
    return this._props.name;
  }
}
