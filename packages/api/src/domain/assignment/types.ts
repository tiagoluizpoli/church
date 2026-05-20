import type {
  AssignmentContext,
  BlockoutContext,
  TimeRange,
} from '../availability/types';
import type { HardConstraintReason } from '../conflict/types';
import type { Assignment } from '../entities/assignment';
import type { AssignmentAudit } from '../entities/assignment-audit';
import type { Event, EventStatus } from '../entities/event';
import type { SlotRequirement } from '../entities/slot-requirement';
import type { TimeSlot } from '../entities/time-slot';

export type EqualSplitStrategy = {
  kind: 'equal-split';
  slotDurationMinutes: number;
};

export type TemplatePeriod = {
  label: string;
  startTime: Date; // Absolute time for the target event day
  endTime: Date;
  requirements?: Array<{
    roleId: string;
    teamId?: string;
    requiredCount: number;
    notes?: string;
  }>;
};

export type TemplateBasedStrategy = {
  kind: 'template-based';
  periods: TemplatePeriod[];
};

export type SlotGenerationStrategy = EqualSplitStrategy | TemplateBasedStrategy;

export type SlotGenerationRequest = {
  churchId: string;
  eventId: string;
  eventStartTime: Date;
  eventEndTime: Date;
  strategy: SlotGenerationStrategy;
  existingSlots?: TimeSlot[];
};

export type GeneratedSlot = {
  slot: TimeSlot;
  requirements: SlotRequirement[];
};

export type SlotGenerationResult = {
  slots: GeneratedSlot[];
  totalCount: number;
  hasRemainder: boolean;
};

export type PublishRequest = {
  churchId: string;
  event: Event;
  assignments: Assignment[];
  now: Date;
  actorId: string;
  assignmentValidationData: Map<
    string,
    {
      volunteerId: string;
      ministryId: string;
      roleId: string;
      slotId: string;
      eventStartTime: Date;
      volunteerQualifiedRoleIds: string[];
      volunteerMinistryIds: string[];
      existingSlotIds: string[];
    }
  >;
};

export type HardConstraintFailure = {
  assignmentId: string;
  volunteerId: string;
  reason: HardConstraintReason;
  message: string;
};

export type SchedulePublishResult = {
  event: Event;
  transitionedCount: number;
  warnings: string[];
  audits?: AssignmentAudit[];
};

export type CancelEventRequest = {
  churchId: string;
  event: Event;
  slots: TimeSlot[];
  assignments: Assignment[];
  actorId: string;
  now: Date;
};

export type EventCancellationResult = {
  event: Event;
  slotsAffected: number;
  assignmentsCancelled: number;
  assignmentsDeleted: number;
  audits?: AssignmentAudit[];
};

export type DeclineAssignmentRequest = {
  churchId: string;
  assignment: Assignment;
  reason?: string;
  actorId: string;
  now: Date;
};

export type ConfirmAssignmentRequest = {
  churchId: string;
  assignment: Assignment;
  actorId: string;
  now: Date;
};

export type ReplacementCandidate = {
  volunteerId: string;
  workloadCount: number;
};

export type ReplacementSearchRequest = {
  churchId: string;
  slotId: string;
  roleId: string;
  slotTimeRange: TimeRange;
  qualifiedVolunteerIds: string[];
  declinedVolunteerIds: string[];
  existingAssignments: AssignmentContext[];
  existingBlockouts: BlockoutContext[];
  workloadMap: Map<string, number>;
};

export type LifecycleTransitionRequest = {
  churchId: string;
  event: Event;
  assignments: Assignment[];
  now: Date;
};

export type LifecycleTransitionResult = {
  transitioned: boolean;
  newStatus?: EventStatus;
  assignmentsAutoConfirmed: number;
};
