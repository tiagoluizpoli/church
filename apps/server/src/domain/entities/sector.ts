import { Entity, type LooseProps } from '@church/core';
import type { ChurchId, MinistryId, SectorId } from '../branded-ids';

export interface SectorProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
}

export class Sector extends Entity<SectorProps, SectorId> {
  constructor(props: LooseProps<SectorProps>, id?: string, createdAt?: Date) {
    super(props as SectorProps, id as SectorId, createdAt);
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
