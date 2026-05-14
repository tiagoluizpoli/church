import { Entity } from '@church/core';

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
  churchId: string;
  volunteerId: string;
  ministryId: string;
  teamId?: string;
  systemRole: SystemRole;
  status: MinistryVolunteerStatus;
  joinedAt: Date;
}

export class MinistryVolunteer extends Entity<MinistryVolunteerProps> {
  constructor(
    props: Omit<MinistryVolunteerProps, 'systemRole' | 'status' | 'joinedAt'> &
      Partial<
        Pick<MinistryVolunteerProps, 'systemRole' | 'status' | 'joinedAt'>
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
      },
      id,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): string {
    return this._props.churchId;
  }

  get volunteerId(): string {
    return this._props.volunteerId;
  }

  get ministryId(): string {
    return this._props.ministryId;
  }

  get teamId(): string | undefined {
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

  public assignTeam(teamId: string): void {
    this._props.teamId = teamId;
    this._updatedAt = new Date();
  }

  public removeTeam(): void {
    this._props.teamId = undefined;
    this._updatedAt = new Date();
  }
}
