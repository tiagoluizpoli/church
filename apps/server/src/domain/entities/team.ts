import { Entity, type LooseProps } from '@church/core';
import { TeamId } from '../branded-ids/team-id';
import type { ChurchId } from './church';
import type { MinistryId } from './ministry';

export { TeamId };

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
