import { Entity, type LooseProps } from '@church/core';
import type { ChurchId, MinistryId, TeamId } from '../branded-ids';

export interface TeamProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
}

export class Team extends Entity<TeamProps, TeamId> {
  constructor(
    props: LooseProps<TeamProps>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(props as TeamProps, id as TeamId, createdAt, updatedAt);
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
