import { DomainError } from '@church/core';
import type {
  AssignmentId,
  AssignmentProps,
} from '../../domain/entities/assignment';
import { Assignment } from '../../domain/entities/assignment';
import type {
  AssignmentAuditId,
  AssignmentAuditProps,
} from '../../domain/entities/assignment-audit';
import { AssignmentAudit } from '../../domain/entities/assignment-audit';
import type {
  AvailabilityId,
  AvailabilityProps,
} from '../../domain/entities/availability';
import { Availability } from '../../domain/entities/availability';
import type { ChurchId, ChurchSlug } from '../../domain/entities/church';
import { Church } from '../../domain/entities/church';
import type { EventId, EventProps } from '../../domain/entities/event';
import { Event } from '../../domain/entities/event';
import type { MinistryId, MinistryProps } from '../../domain/entities/ministry';
import { Ministry } from '../../domain/entities/ministry';
import type { RoleId, RoleProps } from '../../domain/entities/role';
import { Role } from '../../domain/entities/role';
import type {
  RoleTemplateId,
  RoleTemplateItemId,
  RoleTemplateItemProps,
  RoleTemplateProps,
} from '../../domain/entities/role-template';
import {
  RoleTemplate,
  RoleTemplateItem,
} from '../../domain/entities/role-template';
import type {
  SlotRequirementId,
  SlotRequirementProps,
} from '../../domain/entities/slot-requirement';
import { SlotRequirement } from '../../domain/entities/slot-requirement';
import type {
  TimeSlotId,
  TimeSlotProps,
} from '../../domain/entities/time-slot';
import { TimeSlot } from '../../domain/entities/time-slot';
import type {
  UserId,
  VolunteerId,
  VolunteerProps,
} from '../../domain/entities/volunteer';
import { Volunteer } from '../../domain/entities/volunteer';

export class MappingError extends DomainError {
  constructor(field: string, value: unknown) {
    super(`Invalid DB enum value for ${field}: ${String(value)}`);
  }
}

function assertEnum<T extends string>(
  field: string,
  value: string | null | undefined,
  valid: readonly T[],
): T {
  if (value != null && (valid as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new MappingError(field, value);
}

// ──────────────────────────────────────────
// Church
// ──────────────────────────────────────────
export function mapChurch(row: {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Church {
  return new Church(
    { name: row.name, slug: row.slug as ChurchSlug, timezone: row.timezone },
    row.id as ChurchId,
    row.createdAt,
    row.updatedAt,
  );
}

// ──────────────────────────────────────────
// Ministry
// ──────────────────────────────────────────
const ENFORCEMENT_TYPES = ['soft', 'hard'] as const;

export function mapMinistry(row: {
  id: string;
  churchId: string;
  name: string;
  description: string | null;
  enforcementType: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Ministry {
  const props: MinistryProps = {
    churchId: row.churchId as ChurchId,
    name: row.name,
    description: row.description ?? undefined,
    enforcementType: assertEnum(
      'enforcementType',
      row.enforcementType,
      ENFORCEMENT_TYPES,
    ),
    deletedAt: row.deletedAt ?? undefined,
  };
  return new Ministry(
    props,
    row.id as MinistryId,
    row.createdAt,
    row.updatedAt,
  );
}

// ──────────────────────────────────────────
// Role
// ──────────────────────────────────────────
export function mapRole(row: {
  id: string;
  churchId: string;
  ministryId: string | null;
  name: string;
  isGlobal: boolean;
}): Role {
  const props: RoleProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId
      ? (row.ministryId as RoleProps['ministryId'])
      : undefined,
    name: row.name,
    isGlobal: row.isGlobal,
  };
  return new Role(props, row.id as RoleId);
}

// ──────────────────────────────────────────
// Volunteer
// ──────────────────────────────────────────
const VOLUNTEER_STATUSES = ['active', 'inactive', 'on_hold'] as const;

export function mapVolunteer(
  row: {
    id: string;
    churchId: string;
    userId: string;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  name?: string | null,
): Volunteer {
  const props: VolunteerProps = {
    churchId: row.churchId as ChurchId,
    userId: row.userId as UserId,
    status: assertEnum('status', row.status, VOLUNTEER_STATUSES),
    notes: row.notes ?? undefined,
    name: name ?? undefined,
  };
  return new Volunteer(
    props,
    row.id as VolunteerId,
    row.createdAt,
    row.updatedAt,
  );
}

// ──────────────────────────────────────────
// Event
// ──────────────────────────────────────────
const EVENT_STATUSES = ['draft', 'published', 'cancelled', 'past'] as const;
const EVENT_TYPES = ['hourly', 'day_based'] as const;

export function mapEvent(row: {
  id: string;
  churchId: string;
  ministryId: string;
  title: string;
  description: string | null;
  location: string | null;
  startDate: Date;
  endDate: Date;
  status: string;
  eventType: string;
  createdAt: Date;
  updatedAt: Date;
}): Event {
  const props: EventProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as EventProps['ministryId'],
    title: row.title,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    startDate: row.startDate,
    endDate: row.endDate,
    status: assertEnum('status', row.status, EVENT_STATUSES),
    eventType: assertEnum('eventType', row.eventType, EVENT_TYPES),
  };
  return new Event(props, row.id as EventId, row.createdAt, row.updatedAt);
}

// ──────────────────────────────────────────
// SlotRequirement
// ──────────────────────────────────────────
export function mapSlotRequirement(row: {
  id: string;
  churchId: string;
  slotId: string;
  roleId: string;
  teamId: string | null;
  requiredCount: number;
  notes: string | null;
}): SlotRequirement {
  const props: SlotRequirementProps = {
    churchId: row.churchId as ChurchId,
    slotId: row.slotId as TimeSlotId,
    roleId: row.roleId as RoleId,
    teamId: row.teamId
      ? (row.teamId as SlotRequirementProps['teamId'])
      : undefined,
    requiredCount: row.requiredCount,
    notes: row.notes ?? undefined,
  };
  return new SlotRequirement(props, row.id as SlotRequirementId);
}

// ──────────────────────────────────────────
// TimeSlot
// ──────────────────────────────────────────
export function mapTimeSlot(
  row: {
    id: string;
    churchId: string;
    eventId: string;
    startTime: Date;
    endTime: Date;
    label: string | null;
    createdAt: Date;
  },
  requirements: SlotRequirement[] = [],
): TimeSlot {
  const props: TimeSlotProps = {
    churchId: row.churchId as ChurchId,
    eventId: row.eventId as EventId,
    startTime: row.startTime,
    endTime: row.endTime,
    label: row.label ?? undefined,
    status: 'active', // DB has no status column; all persisted slots are active
    requirements,
  };
  return new TimeSlot(
    props,
    row.id as TimeSlotId,
    row.createdAt,
    row.createdAt,
  );
}

// ──────────────────────────────────────────
// Assignment
// ──────────────────────────────────────────
const ASSIGNMENT_STATUSES = [
  'draft',
  'pending',
  'confirmed',
  'declined',
  'cancelled',
] as const;

export function mapAssignment(row: {
  id: string;
  churchId: string;
  slotId: string;
  volunteerId: string;
  roleId: string;
  status: string;
  reason: string | null;
  assignedAt: Date;
  assignedBy: string | null;
}): Assignment {
  const props: AssignmentProps = {
    churchId: row.churchId as ChurchId,
    slotId: row.slotId as TimeSlotId,
    volunteerId: row.volunteerId as VolunteerId,
    roleId: row.roleId as RoleId,
    status: assertEnum('status', row.status, ASSIGNMENT_STATUSES),
    reason: row.reason ?? undefined,
    assignedAt: row.assignedAt,
    assignedBy: row.assignedBy ? (row.assignedBy as UserId) : undefined,
  };
  return new Assignment(props, row.id as AssignmentId);
}

// ──────────────────────────────────────────
// Availability
// ──────────────────────────────────────────
const AVAILABILITY_TYPES = ['available', 'unavailable'] as const;

export function mapAvailability(row: {
  id: string;
  churchId: string;
  volunteerId: string;
  type: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  reason: string | null;
  repeatRule: string | null;
}): Availability {
  const props: AvailabilityProps = {
    churchId: row.churchId as ChurchId,
    volunteerId: row.volunteerId as VolunteerId,
    type: assertEnum('type', row.type, AVAILABILITY_TYPES),
    startTime: row.startTime,
    endTime: row.endTime,
    isAllDay: row.isAllDay,
    reason: row.reason ?? undefined,
    repeatRule: row.repeatRule ?? undefined,
  };
  return new Availability(props, row.id as AvailabilityId);
}

// ──────────────────────────────────────────
// AssignmentAudit
// ──────────────────────────────────────────
const AUDIT_ACTIONS = [
  'created',
  'updated',
  'deleted',
  'status_change',
  'event_published',
  'event_cancelled',
] as const;

export function mapAssignmentAudit(row: {
  id: string;
  churchId: string;
  assignmentId: string;
  actorId: string;
  action: string;
  reason: string | null;
  timestamp: Date;
}): AssignmentAudit {
  const props: AssignmentAuditProps = {
    churchId: row.churchId as ChurchId,
    assignmentId: row.assignmentId as AssignmentId,
    actorId: row.actorId as UserId,
    action: assertEnum('action', row.action, AUDIT_ACTIONS),
    reason: row.reason ?? undefined,
    timestamp: row.timestamp,
  };
  return new AssignmentAudit(props, row.id as AssignmentAuditId);
}

// ──────────────────────────────────────────
// RoleTemplate
// ──────────────────────────────────────────
export function mapRoleTemplateItem(row: {
  id: string;
  churchId: string;
  templateId: string;
  roleId: string;
  requiredCount: number;
}): RoleTemplateItem {
  const props: RoleTemplateItemProps = {
    churchId: row.churchId as ChurchId,
    templateId: row.templateId as RoleTemplateId,
    roleId: row.roleId as RoleId,
    requiredCount: row.requiredCount,
  };
  return new RoleTemplateItem(props, row.id as RoleTemplateItemId);
}

export function mapRoleTemplate(
  row: {
    id: string;
    churchId: string;
    ministryId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  },
  items: RoleTemplateItem[] = [],
): RoleTemplate {
  const props: RoleTemplateProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as MinistryId,
    name: row.name,
    items,
  };
  return new RoleTemplate(
    props,
    row.id as RoleTemplateId,
    row.createdAt,
    row.updatedAt,
  );
}
