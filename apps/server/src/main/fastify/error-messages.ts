import type { DomainError } from '@church/core';
import { m } from '@church/i18n/messages';
import type { Locale } from '@church/i18n/runtime';
import type { ValidationReason } from '@/domain/errors/duplicate-headcount';

type Message = (
  inputs: Record<string, never>,
  options: { locale: Locale },
) => string;

/** One message per error code, no params. */
export const ERROR_MESSAGES: Record<string, Message> = {
  INVALID_DATE_RANGE: m.error_invalid_date_range,
  INVALID_TIME_RANGE: m.error_invalid_time_range,
  INVALID_REQUIRED_COUNT: m.error_invalid_required_count,
  INVALID_SHIFT_SPLIT: m.error_invalid_shift_split,
  INVALID_WEEKDAY: m.error_invalid_weekday,
  NOT_FOUND: m.error_not_found,
  MINISTRY_NOT_FOUND: m.error_ministry_not_found,
  CHECK_ACCESS_DENIED: m.error_check_access_denied,
  ASSIGNMENT_ACCESS_DENIED: m.error_assignment_access_denied,
  ASSIGN_ACTION_NOT_AVAILABLE: m.error_assign_action_not_available,
  INSUFFICIENT_INVITATION_AUTHORITY: m.error_insufficient_invitation_authority,
  CANCEL_WINDOW_CLOSED: m.error_cancel_window_closed,
  ISOLATION_BREACH: m.error_isolation_breach,
  CROSS_MINISTRY_SCOPE: m.error_cross_ministry_scope,
  OVERLAPPING_CYCLE: m.error_overlapping_cycle,
  ILLEGAL_STATE_TRANSITION: m.error_illegal_state_transition,
  EVENT_OUTSIDE_CYCLE: m.error_event_outside_cycle,
  LAST_REMAINING_EVENT_TIME_BLOCK: m.error_last_remaining_event_time_block,
  SHIFT_OUT_OF_BOUNDS: m.error_shift_out_of_bounds,
  HARD_CONSTRAINT_VIOLATION: m.error_hard_constraint_violation,
  BELOW_FULL_PUBLISH: m.error_below_full_publish,
  INVITEE_ALREADY_MINISTRY_MEMBER: m.error_invitee_already_ministry_member,
  RESEND_COOLDOWN_ACTIVE: m.error_resend_cooldown_active,
  RESEND_DAILY_CAP_EXCEEDED: m.error_resend_daily_cap_exceeded,
  INVALID_INVITATION_ROLE: m.error_invalid_invitation_role,
  VALIDATION_ERROR: m.error_validation_error,
};

export const VALIDATION_REASON_MESSAGES: Record<ValidationReason, Message> = {
  DUPLICATE_HEADCOUNT: m.error_validation_duplicate_headcount,
};

/** The catalog text for a domain error, or undefined when its code has no entry. */
export function domainErrorMessage({
  error,
  locale,
}: {
  error: DomainError;
  locale: Locale;
}): string | undefined {
  const reason = (error as { reason?: ValidationReason }).reason;
  const message =
    error.code === 'VALIDATION_ERROR' && reason
      ? VALIDATION_REASON_MESSAGES[reason]
      : ERROR_MESSAGES[error.code];
  return message?.({}, { locale });
}
