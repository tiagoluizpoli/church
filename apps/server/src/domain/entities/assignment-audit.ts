import { type BrandedId, Entity, type LooseProps } from '@church/core';
import type { SoftConflictType } from '../conflict/types';
import type { AssignmentId } from './assignment';
import type { ChurchId } from './church';
import type { UserId } from './volunteer';

export type AssignmentAuditId = BrandedId<'AssignmentAuditId'>;

export const ASSIGNMENT_AUDIT_ACTION_OPTIONS = [
  'created',
  'updated',
  'deleted',
  'status_change',
  'event_published',
  'event_cancelled',
] as const;
export type AssignmentAuditAction =
  (typeof ASSIGNMENT_AUDIT_ACTION_OPTIONS)[number];

export interface AssignmentAuditProps {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  actorId: UserId;
  action: AssignmentAuditAction;
  reason?: string;
  timestamp: Date;
  overrideConflictTypes?: SoftConflictType[];
}

export class AssignmentAudit extends Entity<
  AssignmentAuditProps,
  AssignmentAuditId
> {
  constructor(
    props: Omit<LooseProps<AssignmentAuditProps>, 'timestamp'> &
      Partial<Pick<LooseProps<AssignmentAuditProps>, 'timestamp'>>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        timestamp: props.timestamp ?? new Date(),
      } as unknown as AssignmentAuditProps,
      id as AssignmentAuditId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get assignmentId(): AssignmentId {
    return this._props.assignmentId;
  }

  get actorId(): UserId {
    return this._props.actorId;
  }

  get action(): AssignmentAuditAction {
    return this._props.action;
  }

  get reason(): string | undefined {
    return this._props.reason;
  }

  get overrideConflictTypes(): SoftConflictType[] | undefined {
    return this._props.overrideConflictTypes;
  }

  get timestamp(): Date {
    return this._props.timestamp;
  }
}
