import { Entity } from '@church/core';
import type { SoftConflictType } from '../conflict/types';

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
  churchId: string;
  assignmentId: string;
  leaderId: string;
  action: AssignmentAuditAction;
  reason?: string;
  timestamp: Date;
  overrideConflictTypes?: SoftConflictType[];
}

export class AssignmentAudit extends Entity<AssignmentAuditProps> {
  constructor(
    props: Omit<AssignmentAuditProps, 'timestamp'> &
      Partial<Pick<AssignmentAuditProps, 'timestamp'>>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        timestamp: props.timestamp ?? new Date(),
      },
      id,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): string {
    return this._props.churchId;
  }

  get assignmentId(): string {
    return this._props.assignmentId;
  }

  get leaderId(): string {
    return this._props.leaderId;
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
