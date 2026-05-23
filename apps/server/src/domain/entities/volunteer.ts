import { Entity } from '@church/core';

export const VOLUNTEER_STATUS_OPTIONS = [
  'active',
  'inactive',
  'on_hold',
] as const;
export type VolunteerStatus = (typeof VOLUNTEER_STATUS_OPTIONS)[number];

export interface VolunteerProps {
  churchId: string;
  userId: string;
  status: VolunteerStatus;
  notes?: string;
}

export class Volunteer extends Entity<VolunteerProps> {
  constructor(
    props: Omit<VolunteerProps, 'status'> &
      Partial<Pick<VolunteerProps, 'status'>>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        status: props.status ?? 'active',
      },
      id,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): string {
    return this._props.churchId;
  }

  get userId(): string {
    return this._props.userId;
  }

  get status(): VolunteerStatus {
    return this._props.status;
  }

  get notes(): string | undefined {
    return this._props.notes;
  }

  public activate(): void {
    this._props.status = 'active';
    this._updatedAt = new Date();
  }

  public deactivate(): void {
    this._props.status = 'inactive';
    this._updatedAt = new Date();
  }

  public putOnHold(): void {
    this._props.status = 'on_hold';
    this._updatedAt = new Date();
  }
}
