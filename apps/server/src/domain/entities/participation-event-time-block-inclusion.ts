import { Entity, type LooseProps } from '@church/core';
import type {
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
  ParticipationEventTimeBlockInclusionId,
} from '../branded-ids';

export interface ParticipationEventTimeBlockInclusionProps {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  eventTimeBlockId: EventTimeBlockId;
}

export interface ParticipationEventTimeBlockInclusionInput {
  props: LooseProps<ParticipationEventTimeBlockInclusionProps>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Presence of a row means the ministry serves this time slot (R3). */
export class ParticipationEventTimeBlockInclusion extends Entity<
  ParticipationEventTimeBlockInclusionProps,
  ParticipationEventTimeBlockInclusionId
> {
  constructor({
    props,
    id,
    createdAt,
    updatedAt,
  }: ParticipationEventTimeBlockInclusionInput) {
    super(
      props as ParticipationEventTimeBlockInclusionProps,
      id as ParticipationEventTimeBlockInclusionId,
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

  get eventTimeBlockId(): EventTimeBlockId {
    return this._props.eventTimeBlockId;
  }
}
