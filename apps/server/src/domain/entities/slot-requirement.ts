import { Entity } from '@church/core';
import { InvalidRequiredCountError } from '../errors/invalid-required-count';

export interface SlotRequirementProps {
  churchId: string;
  slotId: string;
  roleId: string;
  teamId?: string;
  requiredCount: number;
  notes?: string;
}

export class SlotRequirement extends Entity<SlotRequirementProps> {
  constructor(
    props: SlotRequirementProps,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (props.requiredCount < 1) {
      throw new InvalidRequiredCountError();
    }
    super(props, id, createdAt, updatedAt);
  }

  get churchId(): string {
    return this._props.churchId;
  }

  get slotId(): string {
    return this._props.slotId;
  }

  get roleId(): string {
    return this._props.roleId;
  }

  get teamId(): string | undefined {
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
