import { AvailabilityEngine } from '../availability/availability-engine';
import { ConflictValidationService } from '../conflict/conflict-validation-service';
import type { HardConstraintReason } from '../conflict/types';
import { AssignmentAudit } from '../entities/assignment-audit';
import { SlotRequirement } from '../entities/slot-requirement';
import { TimeSlot } from '../entities/time-slot';
import { IsolationBreachError } from '../errors';
import {
  DuplicateSlotsError,
  EmptyScheduleError,
  InvalidEventDurationError,
  InvalidSlotDurationError,
  InvalidStateTransitionError,
  PastEventError,
  PublishValidationError,
} from './errors';
import type {
  CancelEventRequest,
  ConfirmAssignmentRequest,
  DeclineAssignmentRequest,
  EqualSplitStrategy,
  EventCancellationResult,
  GeneratedSlot,
  HardConstraintFailure,
  LifecycleTransitionRequest,
  LifecycleTransitionResult,
  PublishRequest,
  ReplacementCandidate,
  ReplacementSearchRequest,
  SchedulePublishResult,
  SlotGenerationRequest,
  SlotGenerationResult,
  TemplateBasedStrategy,
} from './types';

export const AssignmentManagerService = {
  generateSlots(request: SlotGenerationRequest): SlotGenerationResult {
    // Tenant isolation validation
    if (request.existingSlots?.some((s) => s.churchId !== request.churchId)) {
      throw new IsolationBreachError(
        'Isolation breach: slot from different church',
      );
    }

    // 1. Check for duplicate slots
    if (request.existingSlots?.some((s) => s.eventId === request.eventId)) {
      throw new DuplicateSlotsError();
    }

    if (request.strategy.kind === 'equal-split') {
      return this.generateEqualSplitSlots({
        request,
        strategy: request.strategy,
      });
    }

    return this.generateTemplateSlots({ request, strategy: request.strategy });
  },

  generateEqualSplitSlots(params: {
    request: SlotGenerationRequest;
    strategy: EqualSplitStrategy;
  }): SlotGenerationResult {
    const { request, strategy } = params;
    const { slotDurationMinutes } = strategy;
    if (slotDurationMinutes <= 0) {
      throw new InvalidSlotDurationError();
    }

    const eventDurationMs =
      request.eventEndTime.getTime() - request.eventStartTime.getTime();
    if (eventDurationMs <= 0) {
      throw new InvalidEventDurationError();
    }

    const slotDurationMs = slotDurationMinutes * 60 * 1000;
    const slots: GeneratedSlot[] = [];
    const spansMultipleDays =
      request.eventStartTime.toISOString().slice(0, 10) !==
      request.eventEndTime.toISOString().slice(0, 10);

    // If the slot duration matches or exceeds the event duration
    if (slotDurationMs >= eventDurationMs) {
      const slot = new TimeSlot({
        churchId: request.churchId,
        eventId: request.eventId,
        startTime: request.eventStartTime,
        endTime: request.eventEndTime,
        label: this.buildEqualSplitSlotLabel({
          slotStartTime: request.eventStartTime,
          slotNumber: 1,
          spansMultipleDays,
        }),
      });
      slots.push({ slot, requirements: [] });

      return {
        slots,
        totalCount: 1,
        hasRemainder: slotDurationMs > eventDurationMs,
      };
    }

    const fullSlotsCount = Math.floor(eventDurationMs / slotDurationMs);
    const hasRemainder = eventDurationMs % slotDurationMs !== 0;

    let currentStart = request.eventStartTime.getTime();

    for (let i = 0; i < fullSlotsCount; i++) {
      const slotStart = new Date(currentStart);
      const slotEnd = new Date(currentStart + slotDurationMs);
      const slot = new TimeSlot({
        churchId: request.churchId,
        eventId: request.eventId,
        startTime: slotStart,
        endTime: slotEnd,
        label: this.buildEqualSplitSlotLabel({
          slotStartTime: slotStart,
          slotNumber: i + 1,
          spansMultipleDays,
        }),
      });
      slots.push({ slot, requirements: [] });
      currentStart = slotEnd.getTime();
    }

    if (hasRemainder) {
      const slotStart = new Date(currentStart);
      const slotEnd = new Date(request.eventEndTime);
      const slot = new TimeSlot({
        churchId: request.churchId,
        eventId: request.eventId,
        startTime: slotStart,
        endTime: slotEnd,
        label: this.buildEqualSplitSlotLabel({
          slotStartTime: slotStart,
          slotNumber: fullSlotsCount + 1,
          spansMultipleDays,
        }),
      });
      slots.push({ slot, requirements: [] });
    }

    return {
      slots,
      totalCount: slots.length,
      hasRemainder,
    };
  },

  buildEqualSplitSlotLabel(params: {
    slotStartTime: Date;
    slotNumber: number;
    spansMultipleDays: boolean;
  }): string {
    const { slotStartTime, slotNumber, spansMultipleDays } = params;
    if (!spansMultipleDays) {
      return `Slot ${slotNumber}`;
    }

    return `${slotStartTime.toISOString().slice(0, 10)} - Slot ${slotNumber}`;
  },

  generateTemplateSlots(params: {
    request: SlotGenerationRequest;
    strategy: TemplateBasedStrategy;
  }): SlotGenerationResult {
    const { request, strategy } = params;
    const slots: GeneratedSlot[] = [];

    for (const period of strategy.periods) {
      const slot = new TimeSlot({
        churchId: request.churchId,
        eventId: request.eventId,
        startTime: period.startTime,
        endTime: period.endTime,
        label: period.label,
      });

      const requirements: SlotRequirement[] = [];
      if (period.requirements) {
        for (const req of period.requirements) {
          requirements.push(
            new SlotRequirement({
              churchId: request.churchId,
              slotId: slot.id,
              roleId: req.roleId,
              teamId: req.teamId,
              requiredCount: req.requiredCount,
              notes: req.notes,
            }),
          );
        }
      }

      slots.push({ slot, requirements });
    }

    return {
      slots,
      totalCount: slots.length,
      hasRemainder: false,
    };
  },

  publish(request: PublishRequest): SchedulePublishResult {
    const {
      churchId,
      event,
      assignments,
      now,
      actorId,
      assignmentValidationData,
    } = request;

    // Tenant isolation validation
    if (event.churchId !== churchId) {
      throw new IsolationBreachError(
        'Isolation breach: event from different church',
      );
    }
    for (const a of assignments) {
      if (a.churchId !== churchId) {
        throw new IsolationBreachError(
          'Isolation breach: assignment from different church',
        );
      }
    }

    // 1. Check current event status
    if (event.status !== 'draft') {
      throw new InvalidStateTransitionError(event.status, 'publish');
    }

    // 2. Check if event is in the past
    if (event.startDate <= now) {
      throw new PastEventError();
    }

    // 3. Check for empty schedule
    if (assignments.length === 0) {
      throw new EmptyScheduleError();
    }

    const draftAssignments = assignments.filter(
      (assignment) => assignment.status === 'draft',
    );

    // 4. Validate hard constraints
    const failures: HardConstraintFailure[] = [];

    for (const a of draftAssignments) {
      const data = assignmentValidationData.get(a.id);
      if (!data) {
        failures.push({
          assignmentId: a.id,
          volunteerId: a.volunteerId,
          reason: 'NOT_QUALIFIED',
          message: 'Missing validation data for assignment',
        });
        continue;
      }

      try {
        ConflictValidationService.validateHardConstraints({
          churchId,
          volunteerId: data.volunteerId,
          ministryId: data.ministryId,
          roleId: data.roleId,
          slotId: data.slotId,
          eventStartTime: data.eventStartTime,
          now,
          existingSlotIds: data.existingSlotIds,
          volunteerQualifiedRoleIds: data.volunteerQualifiedRoleIds,
          volunteerMinistryIds: data.volunteerMinistryIds,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Hard constraint validation failed';
        const reason =
          error && typeof error === 'object' && 'reason' in error
            ? ((error as { reason: unknown }).reason as HardConstraintReason)
            : 'NOT_QUALIFIED';

        failures.push({
          assignmentId: a.id,
          volunteerId: a.volunteerId,
          reason,
          message,
        });
      }
    }

    if (failures.length > 0) {
      throw new PublishValidationError(failures);
    }

    // 5. Apply transitions atomically
    event.publish();
    for (const a of draftAssignments) {
      a.markAsPending();
    }

    // 6. Create audits
    const audits = draftAssignments.map(
      (a) =>
        new AssignmentAudit({
          churchId,
          assignmentId: a.id,
          actorId,
          action: 'event_published',
          timestamp: now,
        }),
    );

    return {
      event,
      transitionedCount: draftAssignments.length,
      warnings: [],
      audits,
    };
  },

  cancelEvent(request: CancelEventRequest): EventCancellationResult {
    const { churchId, event, slots, assignments, actorId, now } = request;

    // 1. Check current event status
    if (event.status === 'cancelled' || event.status === 'past') {
      throw new InvalidStateTransitionError(event.status, 'cancel');
    }

    // 2. Tenant isolation validation
    if (event.churchId !== churchId) {
      throw new IsolationBreachError('Church ID mismatch');
    }
    for (const slot of slots) {
      if (slot.churchId !== churchId) {
        throw new IsolationBreachError('Church ID mismatch for slot');
      }
    }
    for (const a of assignments) {
      if (a.churchId !== churchId) {
        throw new IsolationBreachError('Church ID mismatch for assignment');
      }
    }

    const originalStatus = event.status;

    // 3. Mutate event status
    event.cancel();

    // 4. Mutate slots
    for (const slot of slots) {
      slot.cancel();
    }

    let assignmentsCancelled = 0;
    let assignmentsDeleted = 0;
    const audits: AssignmentAudit[] = [];

    // 5. Handle assignments based on original event status
    if (originalStatus === 'draft') {
      assignmentsDeleted = assignments.length;
    } else if (originalStatus === 'published') {
      for (const a of assignments) {
        if (a.status === 'pending' || a.status === 'confirmed') {
          a.cancel();
          assignmentsCancelled++;
          audits.push(
            new AssignmentAudit({
              churchId,
              assignmentId: a.id,
              actorId,
              action: 'event_cancelled',
              timestamp: now,
            }),
          );
        }
      }
    }

    return {
      event,
      slotsAffected: slots.length,
      assignmentsCancelled,
      assignmentsDeleted,
      audits,
    };
  },

  confirmAssignment(request: ConfirmAssignmentRequest): AssignmentAudit | null {
    const { churchId, assignment, actorId, now } = request;

    // 1. Tenant isolation validation
    if (assignment.churchId !== churchId) {
      throw new IsolationBreachError('Church ID mismatch');
    }

    // 2. Idempotency: if already confirmed, do nothing and return null
    if (assignment.status === 'confirmed') {
      return null;
    }

    // 3. Status state machine validation: only allow 'pending' -> 'confirmed'
    if (assignment.status !== 'pending') {
      throw new InvalidStateTransitionError(assignment.status, 'confirm');
    }

    // 4. Transition status
    assignment.confirm();

    // 5. Create audit
    return new AssignmentAudit({
      churchId,
      assignmentId: assignment.id,
      actorId,
      action: 'status_change',
      timestamp: now,
    });
  },

  declineAssignment(request: DeclineAssignmentRequest): AssignmentAudit {
    const { churchId, assignment, reason, actorId, now } = request;

    // 1. Tenant isolation validation
    if (assignment.churchId !== churchId) {
      throw new IsolationBreachError('Church ID mismatch');
    }

    // 2. Status state machine validation: only allow 'pending' or 'confirmed' -> 'declined'
    if (assignment.status !== 'pending' && assignment.status !== 'confirmed') {
      throw new InvalidStateTransitionError(assignment.status, 'decline');
    }

    // 3. Transition status
    assignment.decline(reason);

    // 4. Create audit
    return new AssignmentAudit({
      churchId,
      assignmentId: assignment.id,
      actorId,
      action: 'status_change',
      reason,
      timestamp: now,
    });
  },

  findReplacements(request: ReplacementSearchRequest): ReplacementCandidate[] {
    const {
      churchId,
      qualifiedVolunteerIds,
      declinedVolunteerIds,
      slotTimeRange,
      existingBlockouts,
      existingAssignments,
      workloadMap,
    } = request;

    // 1. Tenant isolation validation
    for (const blockout of existingBlockouts) {
      if (blockout.churchId !== churchId) {
        throw new IsolationBreachError(
          'Isolation breach: blockout from different church',
        );
      }
    }
    for (const assignment of existingAssignments) {
      if (assignment.churchId !== churchId) {
        throw new IsolationBreachError(
          'Isolation breach: assignment from different church',
        );
      }
    }

    const declinedSet = new Set(declinedVolunteerIds);
    const candidates: ReplacementCandidate[] = [];

    // Pre-group blockouts and assignments by volunteer to optimize search complexity to O(B + A + N)
    const blockoutsByVolunteer = new Map<string, typeof existingBlockouts>();
    for (const b of existingBlockouts) {
      if (!b.volunteerId) {
        continue;
      }
      let list = blockoutsByVolunteer.get(b.volunteerId);
      if (!list) {
        list = [];
        blockoutsByVolunteer.set(b.volunteerId, list);
      }
      list.push(b);
    }

    const assignmentsByVolunteer = new Map<
      string,
      typeof existingAssignments
    >();
    for (const a of existingAssignments) {
      if (!a.volunteerId) {
        continue;
      }
      let list = assignmentsByVolunteer.get(a.volunteerId);
      if (!list) {
        list = [];
        assignmentsByVolunteer.set(a.volunteerId, list);
      }
      list.push(a);
    }

    for (const volunteerId of qualifiedVolunteerIds) {
      // Filter out volunteers who have already declined this slot
      if (declinedSet.has(volunteerId)) {
        continue;
      }

      const volunteerBlockouts = blockoutsByVolunteer.get(volunteerId) ?? [];
      const volunteerAssignments =
        assignmentsByVolunteer.get(volunteerId) ?? [];

      // Check availability using AvailabilityEngine
      const availability = AvailabilityEngine.checkAvailability({
        churchId,
        volunteerId,
        timeRange: slotTimeRange,
        existingBlockouts: volunteerBlockouts,
        existingAssignments: volunteerAssignments,
      });

      if (availability.status === 'AVAILABLE') {
        const workloadCount = workloadMap.get(volunteerId) ?? 0;
        candidates.push({
          volunteerId,
          workloadCount,
        });
      }
    }

    // Sort ascending by workloadCount. Since Array.prototype.sort is stable in modern JS engines,
    // this preserves the stable tie-breaker order of qualifiedVolunteerIds.
    return candidates.sort((a, b) => a.workloadCount - b.workloadCount);
  },

  transitionExpiredEvent(
    request: LifecycleTransitionRequest,
  ): LifecycleTransitionResult {
    const { churchId, event, assignments, now } = request;

    // 1. Tenant isolation validation
    if (event.churchId !== churchId) {
      throw new IsolationBreachError(
        'Isolation breach: event from different church',
      );
    }
    for (const assignment of assignments) {
      if (assignment.churchId !== churchId) {
        throw new IsolationBreachError(
          'Isolation breach: assignment from different church',
        );
      }
    }

    // 2. Check if event is actually expired
    if (event.endDate > now) {
      return {
        transitioned: false,
        assignmentsAutoConfirmed: 0,
      };
    }

    // 3. Check if event is already in terminal state
    if (event.status === 'past' || event.status === 'cancelled') {
      return {
        transitioned: false,
        assignmentsAutoConfirmed: 0,
      };
    }

    // 4. Perform transition based on event status
    if (event.status === 'published') {
      event.markAsPast();
      let assignmentsAutoConfirmed = 0;
      for (const assignment of assignments) {
        if (assignment.status === 'pending') {
          assignment.confirm();
          assignmentsAutoConfirmed++;
        }
      }
      return {
        transitioned: true,
        newStatus: 'past',
        assignmentsAutoConfirmed,
      };
    }

    if (event.status === 'draft') {
      event.cancel();
      for (const assignment of assignments) {
        assignment.cancel();
      }
      return {
        transitioned: true,
        newStatus: 'cancelled',
        assignmentsAutoConfirmed: 0,
      };
    }

    return {
      transitioned: false,
      assignmentsAutoConfirmed: 0,
    };
  },
};
