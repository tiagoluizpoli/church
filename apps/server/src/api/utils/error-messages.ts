import type { DomainError } from '@church/core';
import { m } from '@church/i18n/messages';
import type { Locale } from '@church/i18n/runtime';
import { type ErrorMessage, errorMessage } from './error-table';
import type { ArchiveBlocker } from '@/domain/archive-blockers';
import { MinistryInUseError } from '@/domain/errors/ministry-in-use';
import {
  type ConflictingCycleReference,
  OverlappingCycleError,
} from '@/domain/errors/overlapping-cycle';
import {
  type ExistingInvitationReference,
  PendingMinistryInvitationExistsError,
} from '@/domain/errors/pending-ministry-invitation-exists';
import { RoleInUseError } from '@/domain/errors/role-in-use';
import { SectorInUseError } from '@/domain/errors/sector-in-use';
import { UpcomingAssignmentsError } from '@/domain/errors/upcoming-assignments';
import {
  type ValidationReason,
  ValidationRuleError,
} from '@/domain/errors/validation-rule-error';
import type { UpcomingMembershipAssignment } from '@/domain/upcoming-membership-assignments';

export const VALIDATION_REASON_MESSAGES: Record<
  ValidationReason,
  ErrorMessage
> = {
  DUPLICATE_HEADCOUNT: m.error_validation_duplicate_headcount,
  DUPLICATE_TEMPLATE_NAME: m.error_validation_duplicate_template_name,
  DUPLICATE_TEMPLATE_BLOCK_LABEL:
    m.error_validation_duplicate_template_block_label,
  USUAL_SETUP_EMPTY: m.error_validation_usual_setup_empty,
  INVALID_SHIFT_INDEX: m.error_validation_invalid_shift_index,
  INVITATION_ROLE_REQUIRED: m.error_validation_invitation_role_required,
};

interface DomainErrorMessageInput {
  error: DomainError;
  locale: Locale;
}

/** The rule-based reason a `VALIDATION_ERROR` carries, also sent to the client. */
export function validationReason(
  error: DomainError,
): ValidationReason | undefined {
  return error instanceof ValidationRuleError ? error.reason : undefined;
}

/** The typed locations that block an archive, also sent to the client. */
export function archiveBlockers(
  error: DomainError,
): ArchiveBlocker[] | undefined {
  return error instanceof SectorInUseError ||
    error instanceof RoleInUseError ||
    error instanceof MinistryInUseError
    ? error.blockers
    : undefined;
}

/** The upcoming Assignments that block a Ministry Membership change, also sent to the client. */
export function upcomingAssignments(
  error: DomainError,
): UpcomingMembershipAssignment[] | undefined {
  return error instanceof UpcomingAssignmentsError
    ? error.assignments
    : undefined;
}

/** The Active Church's Cycles an overlapping range collides with, also sent to the client. */
export function conflictingCycles(
  error: DomainError,
): ConflictingCycleReference[] | undefined {
  return error instanceof OverlappingCycleError
    ? error.conflictingCycles
    : undefined;
}

/** The scope-checked original offer a duplicate refusal points at, also sent to the client. */
export function existingInvitation(
  error: DomainError,
): ExistingInvitationReference | undefined {
  return error instanceof PendingMinistryInvitationExistsError
    ? error.existingInvitation
    : undefined;
}

/** The catalog text for a domain error, or undefined when its code has no entry. */
export function domainErrorMessage({
  error,
  locale,
}: DomainErrorMessageInput): string | undefined {
  const reason = validationReason(error);
  if (error.code === 'VALIDATION_ERROR' && reason) {
    return VALIDATION_REASON_MESSAGES[reason]({}, { locale });
  }
  return errorMessage({ code: error.code, locale });
}
