import { m } from '@church/i18n/messages';
import type { Locale } from '@church/i18n/runtime';

interface ErrorMessageOptions {
  locale: Locale;
}

// named-parameters-ignore: Paraglide generated message signature (inputs, options)
export type ErrorMessage = (
  inputs: Record<string, never>,
  options: ErrorMessageOptions,
) => string;

interface ErrorEntry {
  status: number;
  message: ErrorMessage;
}

/** Codes a controller refuses with; 401/403/404 meaning is ADR-0009's. */
export type RefusalCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ACTIVE_CHURCH_SELECTION_REQUIRED'
  | 'RATE_LIMITED'
  | 'INVITATION_UNAVAILABLE'
  | 'LAST_CHURCH_ADMIN';

/** Domain codes that become an HTTP response. */
export type MappedDomainCode =
  | 'INVALID_DATE_RANGE'
  | 'INVALID_TIME_RANGE'
  | 'INVALID_REQUIRED_COUNT'
  | 'INVALID_SHIFT_SPLIT'
  | 'INVALID_WEEKDAY'
  | 'MINISTRY_NOT_FOUND'
  | 'MINISTRY_NAME_IN_USE'
  | 'MINISTRY_IN_USE'
  | 'ROLE_NAME_IN_USE'
  | 'ROLE_IN_USE'
  | 'SECTOR_NAME_IN_USE'
  | 'SECTOR_IN_USE'
  | 'CHECK_ACCESS_DENIED'
  | 'ASSIGNMENT_ACCESS_DENIED'
  | 'ASSIGN_ACTION_NOT_AVAILABLE'
  | 'INSUFFICIENT_INVITATION_AUTHORITY'
  | 'CANCEL_WINDOW_CLOSED'
  | 'ISOLATION_BREACH'
  | 'CROSS_MINISTRY_SCOPE'
  | 'OVERLAPPING_CYCLE'
  | 'ILLEGAL_STATE_TRANSITION'
  | 'DRAFT_STAFFING_RECONCILIATION_REQUIRED'
  | 'EVENT_OUTSIDE_CYCLE'
  | 'LAST_REMAINING_EVENT_TIME_BLOCK'
  | 'SHIFT_OUT_OF_BOUNDS'
  | 'HARD_CONSTRAINT_VIOLATION'
  | 'BELOW_FULL_PUBLISH'
  | 'INVITEE_ALREADY_CHURCH_MEMBER'
  | 'INVITEE_ALREADY_MINISTRY_MEMBER'
  | 'PENDING_CHURCH_INVITATION_EXISTS'
  | 'PENDING_MINISTRY_INVITATION_EXISTS'
  | 'RESEND_COOLDOWN_ACTIVE'
  | 'RESEND_DAILY_CAP_EXCEEDED'
  | 'INVITATION_NOT_PENDING'
  | 'INVALID_INVITATION_ROLE'
  | 'INVALID_MINISTRY_ROLE'
  | 'MINISTRY_ROLE_REQUIRED'
  | 'MINISTRY_MEMBERSHIP_INACTIVE'
  | 'UPCOMING_ASSIGNMENTS'
  | 'VALIDATION_ERROR';

export type ErrorCode = RefusalCode | MappedDomainCode;

/** The one table of HTTP error codes: status and catalog message each. */
export const ERROR_TABLE: Record<ErrorCode, ErrorEntry> = {
  UNAUTHORIZED: { status: 401, message: m.error_unauthorized },
  FORBIDDEN: { status: 403, message: m.error_forbidden },
  NOT_FOUND: { status: 404, message: m.error_not_found },
  ACTIVE_CHURCH_SELECTION_REQUIRED: {
    status: 409,
    message: m.error_active_church_selection_required,
  },
  RATE_LIMITED: { status: 429, message: m.error_rate_limited },
  INVITATION_UNAVAILABLE: {
    status: 404,
    message: m.error_invitation_unavailable,
  },
  INVALID_DATE_RANGE: { status: 400, message: m.error_invalid_date_range },
  INVALID_TIME_RANGE: { status: 400, message: m.error_invalid_time_range },
  INVALID_REQUIRED_COUNT: {
    status: 400,
    message: m.error_invalid_required_count,
  },
  INVALID_SHIFT_SPLIT: { status: 400, message: m.error_invalid_shift_split },
  INVALID_WEEKDAY: { status: 400, message: m.error_invalid_weekday },
  MINISTRY_NOT_FOUND: { status: 404, message: m.error_ministry_not_found },
  MINISTRY_IN_USE: { status: 409, message: m.error_ministry_in_use },
  MINISTRY_NAME_IN_USE: {
    status: 409,
    message: m.error_ministry_name_in_use,
  },
  ROLE_NAME_IN_USE: { status: 409, message: m.error_role_name_in_use },
  ROLE_IN_USE: { status: 409, message: m.error_role_in_use },
  SECTOR_NAME_IN_USE: { status: 409, message: m.error_sector_name_in_use },
  SECTOR_IN_USE: { status: 409, message: m.error_sector_in_use },
  CHECK_ACCESS_DENIED: { status: 403, message: m.error_check_access_denied },
  ASSIGNMENT_ACCESS_DENIED: {
    status: 403,
    message: m.error_assignment_access_denied,
  },
  ASSIGN_ACTION_NOT_AVAILABLE: {
    status: 403,
    message: m.error_assign_action_not_available,
  },
  INSUFFICIENT_INVITATION_AUTHORITY: {
    status: 403,
    message: m.error_insufficient_invitation_authority,
  },
  CANCEL_WINDOW_CLOSED: { status: 409, message: m.error_cancel_window_closed },
  ISOLATION_BREACH: { status: 409, message: m.error_isolation_breach },
  CROSS_MINISTRY_SCOPE: { status: 409, message: m.error_cross_ministry_scope },
  OVERLAPPING_CYCLE: { status: 409, message: m.error_overlapping_cycle },
  ILLEGAL_STATE_TRANSITION: {
    status: 409,
    message: m.error_illegal_state_transition,
  },
  DRAFT_STAFFING_RECONCILIATION_REQUIRED: {
    status: 409,
    message: m.error_draft_staffing_reconciliation_required,
  },
  EVENT_OUTSIDE_CYCLE: { status: 409, message: m.error_event_outside_cycle },
  LAST_REMAINING_EVENT_TIME_BLOCK: {
    status: 409,
    message: m.error_last_remaining_event_time_block,
  },
  LAST_CHURCH_ADMIN: { status: 409, message: m.error_last_church_admin },
  SHIFT_OUT_OF_BOUNDS: { status: 409, message: m.error_shift_out_of_bounds },
  HARD_CONSTRAINT_VIOLATION: {
    status: 409,
    message: m.error_hard_constraint_violation,
  },
  BELOW_FULL_PUBLISH: { status: 409, message: m.error_below_full_publish },
  INVITEE_ALREADY_CHURCH_MEMBER: {
    status: 409,
    message: m.error_invitee_already_church_member,
  },
  PENDING_CHURCH_INVITATION_EXISTS: {
    status: 409,
    message: m.error_pending_church_invitation_exists,
  },
  INVITEE_ALREADY_MINISTRY_MEMBER: {
    status: 409,
    message: m.error_invitee_already_ministry_member,
  },
  PENDING_MINISTRY_INVITATION_EXISTS: {
    status: 409,
    message: m.error_pending_ministry_invitation_exists,
  },
  RESEND_COOLDOWN_ACTIVE: {
    status: 429,
    message: m.error_resend_cooldown_active,
  },
  RESEND_DAILY_CAP_EXCEEDED: {
    status: 429,
    message: m.error_resend_daily_cap_exceeded,
  },
  INVITATION_NOT_PENDING: {
    status: 409,
    message: m.error_invitation_not_pending,
  },
  INVALID_INVITATION_ROLE: {
    status: 422,
    message: m.error_invalid_invitation_role,
  },
  INVALID_MINISTRY_ROLE: {
    status: 422,
    message: m.error_invalid_ministry_role,
  },
  MINISTRY_ROLE_REQUIRED: {
    status: 409,
    message: m.error_ministry_role_required,
  },
  MINISTRY_MEMBERSHIP_INACTIVE: {
    status: 409,
    message: m.error_ministry_membership_inactive,
  },
  UPCOMING_ASSIGNMENTS: {
    status: 409,
    message: m.error_upcoming_assignments,
  },
  VALIDATION_ERROR: { status: 422, message: m.error_validation_error },
};

export function isErrorCode(code: string): code is ErrorCode {
  return Object.hasOwn(ERROR_TABLE, code);
}

interface ErrorStatusInput {
  code: string;
}

/** The HTTP status for a code, or undefined when the code has no entry. */
export function errorStatus({ code }: ErrorStatusInput): number | undefined {
  return isErrorCode(code) ? ERROR_TABLE[code].status : undefined;
}

interface ErrorMessageInput {
  code: string;
  locale: Locale;
}

/** The catalog text for a code in a locale, or undefined when it has no entry. */
export function errorMessage({
  code,
  locale,
}: ErrorMessageInput): string | undefined {
  return isErrorCode(code)
    ? ERROR_TABLE[code].message({}, { locale })
    : undefined;
}
