import { Entity, type LooseProps } from '@church/core';
import type {
  ChurchId,
  MinistryParticipationId,
  ParticipationSlotInclusionId,
  TimeSlotId,
} from '../branded-ids';

export interface ParticipationSlotInclusionProps {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  timeSlotId: TimeSlotId;
}

export interface ParticipationSlotInclusionInput {
  props: LooseProps<ParticipationSlotInclusionProps>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Presence of a row means the ministry serves this time slot (R3). */
export class ParticipationSlotInclusion extends Entity<
  ParticipationSlotInclusionProps,
  ParticipationSlotInclusionId
> {
  constructor({
    props,
    id,
    createdAt,
    updatedAt,
  }: ParticipationSlotInclusionInput) {
    super(
      props as ParticipationSlotInclusionProps,
      id as ParticipationSlotInclusionId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get participationId(): MinistryParticipationId {
    return this._props.participationId;
  }

  get timeSlotId(): TimeSlotId {
    return this._props.timeSlotId;
  }
}
