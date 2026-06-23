import { type BrandedId, Entity, type LooseProps } from '@church/core';
import type { ChurchId } from './church';
import type { MinistryId } from './ministry';
import type { TeamId } from './team';
import type { VolunteerId } from './volunteer';

export type MinistryVolunteerId = BrandedId<'MinistryVolunteerId'>;

export const SYSTEM_ROLE_OPTIONS = [
  'leader',
  'sub_leader',
  'volunteer',
] as const;
export type SystemRole = (typeof SYSTEM_ROLE_OPTIONS)[number];

export const MINISTRY_VOLUNTEER_STATUS_OPTIONS = [
  'active',
  'inactive',
] as const;
export type MinistryVolunteerStatus =
  (typeof MINISTRY_VOLUNTEER_STATUS_OPTIONS)[number];

export interface MinistryVolunteerProps {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  ministryId: MinistryId;
  teamId?: TeamId;
  systemRole: SystemRole;
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
      'systemRole' | 'status' | 'joinedAt'
    > &
      Partial<
        Pick<
          LooseProps<MinistryVolunteerProps>,
          'systemRole' | 'status' | 'joinedAt'
        >
      >,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        systemRole: props.systemRole ?? 'volunteer',
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

  get teamId(): TeamId | undefined {
    return this._props.teamId;
  }

  get systemRole(): SystemRole {
    return this._props.systemRole;
  }

  get status(): MinistryVolunteerStatus {
    return this._props.status;
  }

  get joinedAt(): Date {
    return this._props.joinedAt;
  }

  public promote(role: SystemRole): void {
    this._props.systemRole = role;
    this._updatedAt = new Date();
  }

  public assignTeam(teamId: TeamId): void {
    this._props.teamId = teamId;
    this._updatedAt = new Date();
  }

  public removeTeam(): void {
    this._props.teamId = undefined;
    this._updatedAt = new Date();
  }
}
