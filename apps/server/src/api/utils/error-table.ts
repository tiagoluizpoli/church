import { m } from '@church/i18n/messages';
import type {
  ErrorCode,
  ErrorEntry,
  ErrorMessageInput,
  ErrorStatusInput,
} from './error-table.types';

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
  INVALID_RECURRENCE: { status: 400, message: m.error_invalid_recurrence },
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
  ISOLATION_BREACH: { status: 409, message: m.error_isolation_breach },
  CROSS_MINISTRY_SCOPE: { status: 409, message: m.error_cross_ministry_scope },
  OVERLAPPING_CYCLE: { status: 409, message: m.error_overlapping_cycle },
  UNANSWERED_TEMPLATE_COLLISIONS: {
    status: 409,
    message: m.error_unanswered_template_collisions,
  },
  ILLEGAL_STATE_TRANSITION: {
    status: 409,
    message: m.error_illegal_state_transition,
  },
  DRAFT_STAFFING_RECONCILIATION_REQUIRED: {
    status: 409,
    message: m.error_draft_staffing_reconciliation_required,
  },
  EVENT_OUTSIDE_CYCLE: { status: 409, message: m.error_event_outside_cycle },
  EVENT_CANCELLED: { status: 409, message: m.error_event_cancelled },
  EVENT_TIME_BLOCK_CANCELLED: {
    status: 409,
    message: m.error_event_time_block_cancelled,
  },
  MOVE_WINDOW_CLOSED: { status: 409, message: m.error_move_window_closed },
  EDIT_WINDOW_CLOSED: { status: 409, message: m.error_edit_window_closed },
  STAFFED_EVENT_TIME_BLOCK_DROP: {
    status: 409,
    message: m.error_staffed_event_time_block_drop,
  },
  PUBLIC_INFO_LOCKED: { status: 409, message: m.error_public_info_locked },
  ADMIN_CANCELLATION_WINDOW_CLOSED: {
    status: 409,
    message: m.error_admin_cancellation_window_closed,
  },
  EMPTY_CYCLE: { status: 409, message: m.error_empty_cycle },
  INVALID_CYCLE_EVENTS: { status: 409, message: m.error_invalid_cycle_events },
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
  HEADCOUNT_BELOW_ASSIGNED: {
    status: 409,
    message: m.error_headcount_below_assigned,
  },
  SHIFT_REQUIREMENT_FULL: {
    status: 409,
    message: m.error_shift_requirement_full,
  },
  SCHEDULE_HAS_NO_ASSIGNMENTS: {
    status: 409,
    message: m.error_schedule_has_no_assignments,
  },
  SCHEDULE_ALREADY_PUBLISHED: {
    status: 409,
    message: m.error_schedule_already_published,
  },
  ASSIGNMENT_PROPOSAL_CHANGED: {
    status: 409,
    message: m.error_assignment_proposal_changed,
  },
  ASSIGNMENT_PROPOSAL_EXCLUSION_INVALID: {
    status: 422,
    message: m.error_assignment_proposal_exclusion_invalid,
  },
  ASSIGNMENT_PROPOSAL_STALE: {
    status: 409,
    message: m.error_assignment_proposal_stale,
  },
  NO_UNSENT_CHANGES: { status: 409, message: m.error_no_unsent_changes },
  SHIFT_STARTED: { status: 409, message: m.error_shift_started },
  SWAP_REQUEST_UNPUBLISHED: {
    status: 409,
    message: m.error_swap_request_unpublished,
  },
  SWAP_REQUEST_SHIFT_STARTED: {
    status: 409,
    message: m.error_swap_request_shift_started,
  },
  SWAP_REQUEST_ALREADY_OPEN: {
    status: 409,
    message: m.error_swap_request_already_open,
  },
  SWAP_REQUEST_NOT_OPEN: {
    status: 409,
    message: m.error_swap_request_not_open,
  },
  // Takes `{ max }`, so domainErrorMessage renders it; the table entry only gives the status.
  SWAP_REQUEST_NOTE_TOO_LONG: {
    status: 400,
    message: m.error_swap_request_note_too_long_generic,
  },
  SHIFT_PUBLISHED: { status: 409, message: m.error_shift_published },
  SHIFT_HAS_RESPONSES: {
    status: 409,
    message: m.error_shift_has_responses,
  },
  ASK_BLOCKED_FLAGGED_SHIFTS: {
    status: 409,
    message: m.error_ask_blocked_flagged_shifts,
  },
  REMIND_ON_COOLDOWN: {
    status: 409,
    message: m.error_remind_on_cooldown,
  },
  LOGO_TOO_LARGE: { status: 413, message: m.error_logo_too_large },
  LOGO_TOO_SMALL: { status: 422, message: m.error_logo_too_small },
  LOGO_BAD_ASPECT_RATIO: {
    status: 422,
    message: m.error_logo_bad_aspect_ratio,
  },
  LOGO_UNSUPPORTED_TYPE: {
    status: 415,
    message: m.error_logo_unsupported_type,
  },
  LOGO_KEY_INVALID: { status: 422, message: m.error_logo_key_invalid },
  VALIDATION_ERROR: { status: 422, message: m.error_validation_error },
  // Takes `{ start, end }`, so domainErrorMessage renders it; the table entry only gives the status.
  EXPORT_RANGE_OUTSIDE_CYCLE: {
    status: 422,
    message: m.error_export_range_outside_cycle_generic,
  },
  EXPORT_SCHEDULE_NOT_FOUND: {
    status: 404,
    message: m.error_export_schedule_not_found,
  },
};

export function isErrorCode(code: string): code is ErrorCode {
  return Object.hasOwn(ERROR_TABLE, code);
}

/** The HTTP status for a code, or undefined when the code has no entry. */
export function errorStatus({ code }: ErrorStatusInput): number | undefined {
  return isErrorCode(code) ? ERROR_TABLE[code].status : undefined;
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
