import { Entity, type LooseProps } from '@church/core';
import type { ChurchId, MinistryId, SectorId } from '../branded-ids';

export interface SectorProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
}

export interface SectorInput {
  props: LooseProps<SectorProps>;
  id?: string;
  createdAt?: Date;
}

export class Sector extends Entity<SectorProps, SectorId> {
  constructor({ props, id, createdAt }: SectorInput) {
    super({ props: props as SectorProps, id: id as SectorId, createdAt });
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
