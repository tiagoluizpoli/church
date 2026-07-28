import { AssignmentAudit } from '../entities/assignment-audit';
import { HardConstraintError } from './errors/hard-constraint-error';
import { InvalidOverrideReasonError } from './errors/invalid-override-reason-error';
import { UnauthorizedOverrideError } from './errors/unauthorized-override-error';
import type {
  ConflictIssue,
  ConflictReport,
  NoConflict,
  OverrideRequest,
  SoftConflictResult,
  SoftConflictType,
  ValidationRequest,
} from './types';

// ---------------------------------------------------------------------------
// Private: Hard Constraint Validation (Phase 1 — throws on first failure)
// ---------------------------------------------------------------------------

function validateHardConstraints(request: ValidationRequest): void {
  const {
    roleId,
    volunteerQualifiedRoleIds,
    ministryId,
    volunteerMinistryIds,
    eventStartTime,
    now,
    slotId,
    existingSlotIds,
  } = request;

  if (!volunteerQualifiedRoleIds.includes(roleId)) {
    throw new HardConstraintError(
      'NOT_QUALIFIED',
      'Volunteer is not qualified for the requested role',
    );
  }

  if (!volunteerMinistryIds.includes(ministryId)) {
    throw new HardConstraintError(
      'NOT_IN_MINISTRY',
      'Volunteer does not belong to the requested ministry',
    );
  }

  if (eventStartTime <= now) {
    throw new HardConstraintError(
      'EVENT_IN_PAST',
      'Event start time is in the past or present',
    );
  }

  if (existingSlotIds.includes(slotId)) {
    throw new HardConstraintError(
      'DUPLICATE_ASSIGNMENT',
      'Volunteer is already assigned to this slot',
    );
  }
}

// ---------------------------------------------------------------------------
// Private: Soft Conflict Detection (Phase 2 — accumulates all issues)
// ---------------------------------------------------------------------------

function detectSoftConflicts(request: ValidationRequest): SoftConflictResult {
  const { availabilityResult, serviceCount, fairnessThreshold } = request;
  const issues: ConflictIssue[] = [];

  if (availabilityResult.status === 'UNAVAILABLE') {
    issues.push({
      type: 'UNAVAILABLE',
      details: 'Volunteer is marked as unavailable during this time',
      conflictingId: availabilityResult.conflictingId,
    });
  }

  if (availabilityResult.status === 'DOUBLE_BOOKED') {
    issues.push({
      type: 'DOUBLE_BOOKED',
      details:
        'Volunteer is already assigned to another slot in this time range',
      conflictingId: availabilityResult.conflictingId,
    });
  }

  if (fairnessThreshold > 0 && serviceCount >= fairnessThreshold) {
    issues.push({
      type: 'FAIRNESS_EXCEEDED',
      details: `Volunteer has reached the fairness limit of ${fairnessThreshold} services`,
      metadata: { serviceCount, fairnessThreshold },
    });
  }

  if (issues.length === 0) {
    return { hasConflicts: false } satisfies NoConflict;
  }

  return { hasConflicts: true, issues } satisfies ConflictReport;
}

// ---------------------------------------------------------------------------
// Private: Override Authorization (validates reason + role)
// ---------------------------------------------------------------------------

function validateOverrideAuthorization(request: OverrideRequest): void {
  if (request.overrideReason.trim() === '') {
    throw new InvalidOverrideReasonError();
  }

  const { caller, targetMinistryId } = request;

  if (caller.isChurchAdmin) {
    return;
  }

  if (caller.isMinistryLeader && caller.ministryId === targetMinistryId) {
    return;
  }

  throw new UnauthorizedOverrideError(
    `Caller is not authorized to override conflicts for ministry '${targetMinistryId}'`,
  );
}

// ---------------------------------------------------------------------------
// Private: Audit Creation
// ---------------------------------------------------------------------------

function createOverrideAudit(
  request: OverrideRequest,
  report: ConflictReport,
): AssignmentAudit {
  const conflictTypes: SoftConflictType[] = report.issues.map(
    (issue) => issue.type,
  );

  return new AssignmentAudit({
    churchId: request.churchId,
    assignmentId: request.assignmentId,
    actorId: request.caller.userId,
    action: 'created',
    reason: request.overrideReason,
    overrideConflictTypes: conflictTypes,
    timestamp: request.now,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const ConflictValidationService = {
  /**
   * Validates a scheduling assignment against all constraints.
   * Phase 1: Hard constraints — throws HardConstraintError on first violation.
   * Phase 2: Soft conflicts — accumulates all issues into a ConflictReport.
   */
  validate(request: ValidationRequest): SoftConflictResult {
    validateHardConstraints(request);
    return detectSoftConflicts(request);
  },

  /**
   * Validates only the hard constraints. Throws HardConstraintError on violation.
   */
  validateHardConstraints(
    request: Omit<
      ValidationRequest,
      'availabilityResult' | 'serviceCount' | 'fairnessThreshold'
    >,
  ): void {
    validateHardConstraints(request as ValidationRequest);
  },

  /**
   * Authorizes a leader override of soft conflicts and returns an audit record.
   * Caller is responsible for persisting the returned AssignmentAudit entity.
   */
  authorizeOverride(
    request: OverrideRequest,
    report: ConflictReport,
  ): AssignmentAudit {
    validateOverrideAuthorization(request);
    return createOverrideAudit(request, report);
  },
} as const;
