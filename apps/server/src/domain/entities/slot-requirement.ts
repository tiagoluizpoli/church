import { type BrandedId, Entity } from '@church/core';
import { InvalidRequiredCountError } from '../errors/invalid-required-count';
import type { ChurchId } from './church';
import type { RoleId } from './role';
import type { TeamId } from './team';
import type { TimeSlotId } from './time-slot';

export type SlotRequirementId = BrandedId<'SlotRequirementId'>;

export interface SlotRequirementProps {
  churchId: ChurchId;
  slotId: TimeSlotId;
  roleId: RoleId;
  teamId?: TeamId;
  requiredCount: number;
  notes?: string;
}

export class SlotRequirement extends Entity<
  SlotRequirementProps,
  SlotRequirementId
> {
  constructor(
    props: SlotRequirementProps,
    id?: SlotRequirementId,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (props.requiredCount < 1) {
      throw new InvalidRequiredCountError();
    }
    super(props, id, createdAt, updatedAt);
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get slotId(): TimeSlotId {
    return this._props.slotId;
  }

  get roleId(): RoleId {
    return this._props.roleId;
  }

  get teamId(): TeamId | undefined {
    return this._props.teamId;
  }

  get requiredCount(): number {
    return this._props.requiredCount;
  }

  get notes(): string | undefined {
    return this._props.notes;
  }

  public updateCount(count: number): void {
    if (count < 1) {
      throw new InvalidRequiredCountError();
    }
    this._props.requiredCount = count;
    this._updatedAt = new Date();
  }
}
