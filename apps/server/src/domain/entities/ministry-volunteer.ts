import { type BrandedId, Entity, type LooseProps } from '@church/core';
import type { ChurchId, MinistryId, VolunteerId } from '../branded-ids';

export type MinistryVolunteerId = BrandedId<'MinistryVolunteerId'>;

export const MINISTRY_ACCESS_LEVEL_OPTIONS = ['leader', 'volunteer'] as const;
export type MinistryAccessLevel =
  (typeof MINISTRY_ACCESS_LEVEL_OPTIONS)[number];

export const MINISTRY_VOLUNTEER_STATUS_OPTIONS = [
  'active',
  'inactive',
] as const;
export type MinistryVolunteerStatus =
  (typeof MINISTRY_VOLUNTEER_STATUS_OPTIONS)[number];

/**
 * Team membership lives in `ministry_volunteer_team` and role qualification in
 * `ministry_volunteer_role` — both many-to-many, both read through the
 * volunteer repository rather than carried on this entity.
 *
 * `ministryAccessLevel` is ministry-wide (`leader` = full ministry
 * authority, `volunteer` = regular member). Team-scoped leadership
 * (TeamLeader) is a separate axis carried on `ministry_volunteer_team`'s
 * access level, not on this entity.
 */
export interface MinistryVolunteerProps {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  ministryId: MinistryId;
  ministryAccessLevel: MinistryAccessLevel;
  status: MinistryVolunteerStatus;
  joinedAt: Date;
}

export class MinistryVolunteer extends Entity<
  MinistryVolunteerProps,
  MinistryVolunteerId
> {
  constructor(
    props: Omit<
      LooseProps<MinistryVolunteerProps>,
      'ministryAccessLevel' | 'status' | 'joinedAt'
    > &
      Partial<
        Pick<
          LooseProps<MinistryVolunteerProps>,
          'ministryAccessLevel' | 'status' | 'joinedAt'
        >
      >,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        ministryAccessLevel: props.ministryAccessLevel ?? 'volunteer',
        status: props.status ?? 'active',
        joinedAt: props.joinedAt ?? new Date(),
      } as unknown as MinistryVolunteerProps,
      id as MinistryVolunteerId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get volunteerId(): VolunteerId {
    return this._props.volunteerId;
  }

  get ministryId(): MinistryId {
    return this._props.ministryId;
  }

  get ministryAccessLevel(): MinistryAccessLevel {
    return this._props.ministryAccessLevel;
  }

  get status(): MinistryVolunteerStatus {
    return this._props.status;
  }

  get joinedAt(): Date {
    return this._props.joinedAt;
  }

  public promote(accessLevel: MinistryAccessLevel): void {
    this._props.ministryAccessLevel = accessLevel;
    this._updatedAt = new Date();
  }
}
