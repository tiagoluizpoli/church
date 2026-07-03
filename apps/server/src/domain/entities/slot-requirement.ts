import { type BrandedId, Entity, type LooseProps } from '@church/core';
import type {
  ChurchId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TeamId,
  TimeSlotId,
} from '../branded-ids';
import { InvalidRequiredCountError } from '../errors/invalid-required-count';

export type SlotRequirementId = BrandedId<'SlotRequirementId'>;

export interface SlotRequirementProps {
  churchId: ChurchId;
  slotId: TimeSlotId;
  participationId?: MinistryParticipationId;
  shiftId?: ShiftId;
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
    props: LooseProps<SlotRequirementProps>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (props.requiredCount < 1) {
      throw new InvalidRequiredCountError();
    }
    super(
      props as SlotRequirementProps,
      id as SlotRequirementId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get slotId(): TimeSlotId {
    return this._props.slotId;
  }

  get participationId(): MinistryParticipationId | undefined {
    return this._props.participationId;
  }

  get shiftId(): ShiftId | undefined {
    return this._props.shiftId;
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
