import { type BrandedId, Entity, type LooseProps } from '@church/core';
import { now, toDate } from '@church/time';
import type {
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TeamId,
} from '../branded-ids';
import { InvalidRequiredCountError } from '../errors/invalid-required-count';

export type ShiftRequirementId = BrandedId<'ShiftRequirementId'>;

export interface ShiftRequirementProps {
  churchId: ChurchId;
  eventTimeBlockId: EventTimeBlockId;
  participationId?: MinistryParticipationId;
  shiftId?: ShiftId;
  roleId: RoleId;
  teamId?: TeamId;
  peopleNeeded: number;
  notes?: string;
}

export class ShiftRequirement extends Entity<
  ShiftRequirementProps,
  ShiftRequirementId
> {
  constructor(
    props: LooseProps<ShiftRequirementProps>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (props.peopleNeeded < 1) {
      throw new InvalidRequiredCountError();
    }
    super(
      props as ShiftRequirementProps,
      id as ShiftRequirementId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get eventTimeBlockId(): EventTimeBlockId {
    return this._props.eventTimeBlockId;
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

  get peopleNeeded(): number {
    return this._props.peopleNeeded;
  }

  get notes(): string | undefined {
    return this._props.notes;
  }

  public updateCount(count: number): void {
    if (count < 1) {
      throw new InvalidRequiredCountError();
    }
    this._props.peopleNeeded = count;
    this._updatedAt = toDate({ instant: now() });
  }
}
