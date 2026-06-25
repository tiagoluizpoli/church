import { type BrandedId, Entity, type LooseProps } from '@church/core';
import type { ChurchId } from './church';

export type VolunteerId = BrandedId<'VolunteerId'>;
export type UserId = BrandedId<'UserId'>;

export const VOLUNTEER_STATUS_OPTIONS = [
  'active',
  'inactive',
  'on_hold',
] as const;
export type VolunteerStatus = (typeof VOLUNTEER_STATUS_OPTIONS)[number];

export interface VolunteerProps {
  churchId: ChurchId;
  userId: UserId;
  status: VolunteerStatus;
  notes?: string;
  /** Denormalized display name, populated when the user table is joined. */
  name?: string;
}

export class Volunteer extends Entity<VolunteerProps, VolunteerId> {
  constructor(
    props: Omit<LooseProps<VolunteerProps>, 'status'> &
      Partial<Pick<LooseProps<VolunteerProps>, 'status'>>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        status: props.status ?? 'active',
      } as VolunteerProps,
      id as VolunteerId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get userId(): UserId {
    return this._props.userId;
  }

  get status(): VolunteerStatus {
    return this._props.status;
  }

  get notes(): string | undefined {
    return this._props.notes;
  }

  get name(): string | undefined {
    return this._props.name;
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
