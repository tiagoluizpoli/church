import { type BrandedId, Entity, type LooseProps } from '@church/core';
import { type Instant, now, toDate } from '@church/time';
import type { ChurchId, MinistryId, VolunteerId } from '../branded-ids';

export type MinistryMembershipId = BrandedId<'MinistryMembershipId'>;

export const MINISTRY_ACCESS_LEVEL_OPTIONS = ['leader', 'volunteer'] as const;
export type MinistryAccessLevel =
  (typeof MINISTRY_ACCESS_LEVEL_OPTIONS)[number];

export const MINISTRY_MEMBERSHIP_STATUS_OPTIONS = [
  'active',
  'inactive',
] as const;
export type MinistryMembershipStatus =
  (typeof MINISTRY_MEMBERSHIP_STATUS_OPTIONS)[number];

/**
 * Team membership lives in `ministry_membership_team` and role qualification in
 * `ministry_membership_role` — both many-to-many, both read through the
 * volunteer repository rather than carried on this entity.
 *
 * `ministryAccessLevel` is ministry-wide (`leader` = full ministry
 * authority, `volunteer` = regular member). Team-scoped leadership
 * (TeamLeader) is a separate axis carried on `ministry_membership_team`'s
 * access level, not on this entity.
 */
export interface MinistryMembershipProps {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  ministryId: MinistryId;
  ministryAccessLevel: MinistryAccessLevel;
  status: MinistryMembershipStatus;
  joinedAt: Instant;
}

export class MinistryMembership extends Entity<
  MinistryMembershipProps,
  MinistryMembershipId
> {
  constructor(
    props: Omit<
      LooseProps<MinistryMembershipProps>,
      'ministryAccessLevel' | 'status' | 'joinedAt'
    > &
      Partial<
        Pick<
          LooseProps<MinistryMembershipProps>,
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
        joinedAt: props.joinedAt ?? now(),
      } as unknown as MinistryMembershipProps,
      id as MinistryMembershipId,
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

  get status(): MinistryMembershipStatus {
    return this._props.status;
  }

  get joinedAt(): Instant {
    return this._props.joinedAt;
  }

  public promote(accessLevel: MinistryAccessLevel): void {
    this._props.ministryAccessLevel = accessLevel;
    this._updatedAt = toDate({ instant: now() });
  }
}
