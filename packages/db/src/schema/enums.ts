import { pgEnum } from 'drizzle-orm/pg-core';

export const enforcementTypeEnum = pgEnum('enforcement_type', ['soft', 'hard']);

export const volunteerStatusEnum = pgEnum('volunteer_status', [
  'active',
  'inactive',
  'on_hold',
]);

export const systemRoleEnum = pgEnum('system_role', [
  'leader',
  'sub_leader',
  'volunteer',
]);

export const membershipStatusEnum = pgEnum('membership_status', [
  'active',
  'inactive',
]);

export const eventStatusEnum = pgEnum('event_status', [
  'draft',
  'published',
  'cancelled',
]);

export const assignmentStatusEnum = pgEnum('assignment_status', [
  'pending',
  'confirmed',
  'declined',
]);

export const availabilityTypeEnum = pgEnum('availability_type', [
  'available',
  'unavailable',
]);

export const auditActionEnum = pgEnum('audit_action', [
  'created',
  'updated',
  'deleted',
  'status_change',
]);
