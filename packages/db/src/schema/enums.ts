import { pgEnum } from 'drizzle-orm/pg-core';

export const enforcementTypeEnum = pgEnum('enforcement_type', ['soft', 'hard']);

export const volunteerStatusEnum = pgEnum('volunteer_status', [
  'active',
  'inactive',
  'on_hold',
]);

export const ministryAccessLevelEnum = pgEnum('ministry_access_level', [
  'leader',
  'volunteer',
]);

export const teamAccessLevelEnum = pgEnum('team_access_level', [
  'leader',
  'member',
]);

export const membershipStatusEnum = pgEnum('membership_status', [
  'active',
  'inactive',
]);

export const eventStatusEnum = pgEnum('event_status', [
  'draft',
  'scheduled',
  'cancelled',
  'past',
]);

export const planningCycleStateEnum = pgEnum('planning_cycle_state', [
  'draft',
  'locked',
  'archived',
]);

export const participationStateEnum = pgEnum('participation_state', [
  'tailoring',
  'availability_fired',
  'rostering',
  'published',
]);

export const availabilityCheckStateEnum = pgEnum('availability_check_state', [
  'pending',
  'confirmed',
]);

export const defaultDirectionEnum = pgEnum('default_direction', [
  'all_in',
  'all_out',
]);

export const eventTypeEnum = pgEnum('event_type', ['hourly', 'day_based']);

export const assignmentStatusEnum = pgEnum('assignment_status', [
  'draft',
  'pending',
  'confirmed',
  'declined',
  'cancelled',
]);

export const auditActionEnum = pgEnum('audit_action', [
  'created',
  'updated',
  'deleted',
  'status_change',
]);

export const volunteerNotificationTypeEnum = pgEnum(
  'volunteer_notification_type',
  [
    'schedule_published',
    'assignment_added',
    'assignment_changed',
    'assignment_removed',
    'availability_reminder',
    'availability_conflict',
    'assignment_reminder',
  ],
);

export const ministryInvitationStatusEnum = pgEnum(
  'ministry_invitation_status',
  ['pending', 'accepted', 'rejected', 'canceled'],
);

export const outboxMessageKindEnum = pgEnum('outbox_message_kind', [
  'invitation.chained',
  'invitation.ministry',
  'invitation.church-bootstrap',
  'transfer.ministry-digest',
  'transfer.leaderless-ministry',
]);

export const outboxMessageStatusEnum = pgEnum('outbox_message_status', [
  'pending',
  'sent',
  'failed',
]);
