import { ConflictValidationService } from '../conflict/conflict-validation-service';
import type { HardConstraintReason } from '../conflict/types';
import { AssignmentAudit } from '../entities/assignment-audit';
import { SlotRequirement } from '../entities/slot-requirement';
import { TimeSlot } from '../entities/time-slot';
import {
  DuplicateSlotsError,
  EmptyScheduleError,
  InvalidStateTransitionError,
  PublishValidationError,
} from './errors';
import type {
  EqualSplitStrategy,
  GeneratedSlot,
  HardConstraintFailure,
  PublishRequest,
  SchedulePublishResult,
  SlotGenerationRequest,
  SlotGenerationResult,
  TemplateBasedStrategy,
} from './types';

export const AssignmentManagerService = {
  generateSlots(request: SlotGenerationRequest): SlotGenerationResult {
    // 1. Check for duplicate slots
    if (request.existingSlots?.some((s) => s.eventId === request.eventId)) {
      throw new DuplicateSlotsError();
    }

    if (request.strategy.kind === 'equal-split') {
      return this.generateEqualSplitSlots(request, request.strategy);
    }

    return this.generateTemplateSlots(request, request.strategy);
  },

  generateEqualSplitSlots(
    request: SlotGenerationRequest,
    strategy: EqualSplitStrategy,
  ): SlotGenerationResult {
    const { slotDurationMinutes } = strategy;
    if (slotDurationMinutes <= 0) {
      throw new Error('Slot duration must be greater than zero');
    }

    const eventDurationMs =
      request.eventEndTime.getTime() - request.eventStartTime.getTime();
    if (eventDurationMs <= 0) {
      throw new Error('Event duration must be greater than zero');
    }

    const slotDurationMs = slotDurationMinutes * 60 * 1000;
    const slots: GeneratedSlot[] = [];

    // If the slot duration matches or exceeds the event duration
    if (slotDurationMs >= eventDurationMs) {
      const slot = new TimeSlot({
        churchId: request.churchId,
        eventId: request.eventId,
        startTime: request.eventStartTime,
        endTime: request.eventEndTime,
        label: 'Slot 1',
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
        label: `Slot ${i + 1}`,
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
        label: `Slot ${fullSlotsCount + 1}`,
      });
      slots.push({ slot, requirements: [] });
    }

    return {
      slots,
      totalCount: slots.length,
      hasRemainder,
    };
  },

  generateTemplateSlots(
    request: SlotGenerationRequest,
    strategy: TemplateBasedStrategy,
  ): SlotGenerationResult {
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

    // 1. Check current event status
    if (event.status !== 'draft') {
      throw new InvalidStateTransitionError(event.status, 'publish');
    }

    // 2. Check if event is in the past
    if (event.startDate <= now) {
      throw new Error(
        'Cannot publish an event that has already started or is in the past',
      );
    }

    // 3. Check for empty schedule
    if (assignments.length === 0) {
      throw new EmptyScheduleError();
    }

    // 4. Validate hard constraints
    const failures: HardConstraintFailure[] = [];

    for (const a of assignments) {
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
    for (const a of assignments) {
      a.markAsPending();
    }

    // 6. Create audits
    const audits = assignments.map(
      (a) =>
        new AssignmentAudit({
          churchId,
          assignmentId: a.id,
          leaderId: actorId,
          action: 'event_published',
          timestamp: now,
        }),
    );

    return {
      event,
      transitionedCount: assignments.length,
      warnings: [],
      audits,
    };
  },
};
