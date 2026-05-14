import { Entity } from '@church/core';

export const ASSIGNMENT_STATUS_OPTIONS = [
  'pending',
  'confirmed',
  'declined',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS_OPTIONS)[number];

export interface AssignmentProps {
  churchId: string;
  slotId: string;
  volunteerId: string;
  roleId: string;
  status: AssignmentStatus;
  reason?: string;
  assignedAt: Date;
  assignedBy?: string;
}

export class Assignment extends Entity<AssignmentProps> {
  constructor(
    props: Omit<AssignmentProps, 'status' | 'assignedAt'> &
      Partial<Pick<AssignmentProps, 'status' | 'assignedAt'>>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        status: props.status ?? 'pending',
        assignedAt: props.assignedAt ?? new Date(),
      },
      id,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): string {
    return this._props.churchId;
  }

  get slotId(): string {
    return this._props.slotId;
  }

  get volunteerId(): string {
    return this._props.volunteerId;
  }

  get roleId(): string {
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

  get assignedBy(): string | undefined {
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
}
