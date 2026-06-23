import { type BrandedId, Entity } from '@church/core';
import type { ChurchId } from './church';
import type { MinistryId } from './ministry';

export type TeamId = BrandedId<'TeamId'>;

export interface TeamProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
}

export class Team extends Entity<TeamProps, TeamId> {
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
