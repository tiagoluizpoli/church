import { Entity, type LooseProps } from '@church/core';
import { AssignmentId } from '../branded-ids/assignment-id';
import type { ChurchId } from './church';
import type { RoleId } from './role';
import type { TimeSlotId } from './time-slot';
import type { UserId, VolunteerId } from './volunteer';

export { AssignmentId };

export const ASSIGNMENT_STATUS_OPTIONS = [
  'draft',
  'pending',
  'confirmed',
  'declined',
  'cancelled',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS_OPTIONS)[number];

export interface AssignmentProps {
  churchId: ChurchId;
  slotId: TimeSlotId;
  volunteerId: VolunteerId;
  roleId: RoleId;
  status: AssignmentStatus;
  reason?: string;
  assignedAt: Date;
  assignedBy?: UserId;
}

export class Assignment extends Entity<AssignmentProps, AssignmentId> {
  constructor(
    props: Omit<LooseProps<AssignmentProps>, 'status' | 'assignedAt'> &
      Partial<Pick<LooseProps<AssignmentProps>, 'status' | 'assignedAt'>>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        status: props.status ?? 'draft',
        assignedAt: props.assignedAt ?? new Date(),
      } as unknown as AssignmentProps,
      id as AssignmentId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get slotId(): TimeSlotId {
    return this._props.slotId;
  }

  get volunteerId(): VolunteerId {
    return this._props.volunteerId;
  }

  get roleId(): RoleId {
    return this._props.roleId;
  }

  get status(): AssignmentStatus {
    return this._props.status;
  }

  get reason(): string | undefined {
    return this._props.reason;
  }

  get assignedAt(): Date {
    return this._props.assignedAt;
  }

  get assignedBy(): UserId | undefined {
    return this._props.assignedBy;
  }

  public confirm(): void {
    this._props.status = 'confirmed';
    this._updatedAt = new Date();
  }

  public decline(reason?: string): void {
    this._props.status = 'declined';
    if (reason !== undefined) {
      this._props.reason = reason;
    }
    this._updatedAt = new Date();
  }

  public markAsPending(): void {
    this._props.status = 'pending';
    this._updatedAt = new Date();
  }

  public cancel(): void {
    this._props.status = 'cancelled';
    this._updatedAt = new Date();
  }
}
