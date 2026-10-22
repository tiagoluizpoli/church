import { Entity, type LooseProps } from '@church/core';
import { type Instant, now, toDate } from '@church/time';
import type {
  AssignmentId,
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  ShiftRequirementId,
  UserId,
  VolunteerId,
} from '../branded-ids';

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
  eventTimeBlockId: EventTimeBlockId;
  participationId?: MinistryParticipationId;
  shiftId?: ShiftId;
  volunteerId: VolunteerId;
  roleId: RoleId;
  shiftRequirementId: ShiftRequirementId;
  status: AssignmentStatus;
  reason?: string;
  assignedAt: Instant;
  assignedBy?: UserId;
}

export interface AssignmentInput {
  props: Omit<LooseProps<AssignmentProps>, 'status' | 'assignedAt'> &
    Partial<Pick<LooseProps<AssignmentProps>, 'status' | 'assignedAt'>>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Assignment extends Entity<AssignmentProps, AssignmentId> {
  constructor({ props, id, createdAt, updatedAt }: AssignmentInput) {
    super({
      props: {
        ...props,
        status: props.status ?? 'draft',
        assignedAt: props.assignedAt ?? now(),
      } as unknown as AssignmentProps,
      id: id as AssignmentId,
      createdAt,
      updatedAt,
    });
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get eventTimeBlockId(): EventTimeBlockId {
    return this._props.eventTimeBlockId;
  }

  get participationId(): MinistryParticipationId | undefined {
    return this._props.participationId;
  }

  get shiftId(): ShiftId | undefined {
    return this._props.shiftId;
  }

  get volunteerId(): VolunteerId {
    return this._props.volunteerId;
  }

  get roleId(): RoleId {
    return this._props.roleId;
  }

  get shiftRequirementId(): ShiftRequirementId {
    return this._props.shiftRequirementId;
  }

  get status(): AssignmentStatus {
    return this._props.status;
  }

  get reason(): string | undefined {
    return this._props.reason;
  }

  get assignedAt(): Instant {
    return this._props.assignedAt;
  }

  get assignedBy(): UserId | undefined {
    return this._props.assignedBy;
  }

  public confirm(): void {
    this._props.status = 'confirmed';
    this._updatedAt = toDate({ instant: now() });
  }

  public decline(reason?: string): void {
    this._props.status = 'declined';
    if (reason !== undefined) {
      this._props.reason = reason;
    }
    this._updatedAt = toDate({ instant: now() });
  }

  public markAsPending(): void {
    this._props.status = 'pending';
    this._updatedAt = toDate({ instant: now() });
  }

  public cancel(): void {
    this._props.status = 'cancelled';
    this._updatedAt = toDate({ instant: now() });
  }
}
