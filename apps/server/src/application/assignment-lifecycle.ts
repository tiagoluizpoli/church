import { NotFoundError } from '@church/core';
import { now, toDate } from '@church/time';
import type { ShiftId } from '../domain/branded-ids';
import { HardConstraintError } from '../domain/conflict/errors/hard-constraint-error';
import type {
  AddAssignmentInput,
  AdmitInput,
  AssignFacts,
  AssignInput,
  AssignmentFactsReaderDependencies,
  AssignmentLifecycleDependencies,
  BookingsInput,
  FilledInput,
  IAssignmentFactsReader,
  IAssignmentLifecycle,
  LifecycleExitInput,
  LoadAssignFactsInput,
  LoadMoveFactsInput,
  MoveAssignmentInput,
  RefuseInput,
  ReplaceAssignmentInput,
  ShiftStartGuardInput,
  StartAssigningInput,
} from '../domain/contracts/application/assignment-lifecycle';
import type { CreateParticipationAssignmentResult } from '../domain/contracts/application/assignment-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '../domain/contracts/infrastructure/assignment-audit.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { SwapRequestRepository } from '../domain/contracts/infrastructure/swap-request.repository';
import type { UnavailableShiftRepository } from '../domain/contracts/infrastructure/unavailable-shift.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import {
  type Assignment,
  isActiveAssignmentStatus,
} from '../domain/entities/assignment';
import type { Shift } from '../domain/entities/shift';
import type { ShiftRequirement } from '../domain/entities/shift-requirement';
import {
  EventCancelledError,
  EventTimeBlockCancelledError,
} from '../domain/errors/event-cancelled';
import { ShiftRequirementFullError } from '../domain/errors/shift-requirement-full';
import { ShiftStartedError } from '../domain/errors/shift-started';
import { eventTimeBlockCancellation } from '../domain/event-time-block-cancellation';
import {
  findAssignmentRefusal,
  isMarkedUnavailable,
} from '../domain/services/assignment-eligibility';
import type { AssignmentEligibility } from '../domain/services/assignment-eligibility.types';

/**
 * The Assignment lifecycle (#1122): every way an Assignment comes and goes,
 * with its audit row, the Schedule's move to assigning and the closing of
 * its open swap request. Eligibility rules are the pure
 * `domain/services/assignment-eligibility`; this module loads their facts,
 * maps a refusal to the error each entry point answers, and writes.
 * Authorization stays with the callers (ADR-0009), which also hold the
 * Church and Participation locks.
 */

// ── Refusals ────────────────────────────────────────────────────────────────

/** Today's error for each refusal. Proposal-only refusals answer stale at Apply instead. */
function refusalError({ refusal, notOnShift }: RefuseInput): Error {
  switch (refusal) {
    case 'SHIFT_STARTED':
      return new ShiftStartedError();
    case 'EVENT_CANCELLED':
      return new EventCancelledError();
    case 'EVENT_TIME_BLOCK_CANCELLED':
      return new EventTimeBlockCancelledError();
    case 'REQUIREMENT_NOT_ON_SHIFT':
      return notOnShift();
    case 'NOT_IN_MINISTRY':
      return new HardConstraintError({
        reason: 'NOT_IN_MINISTRY',
        message: 'Volunteer does not belong to the requested ministry',
      });
    case 'NOT_QUALIFIED':
      return new HardConstraintError({
        reason: 'NOT_QUALIFIED',
        message: 'Volunteer is not qualified for the requested role',
      });
    case 'ALREADY_ON_SHIFT':
      return new HardConstraintError({
        reason: 'DUPLICATE_ASSIGNMENT',
        message: 'Volunteer is already assigned to this shift',
      });
    case 'SHIFT_REQUIREMENT_FULL':
      return new ShiftRequirementFullError();
    case 'DOUBLE_BOOKED':
      return new HardConstraintError({
        reason: 'DUPLICATE_ASSIGNMENT',
        message: 'Volunteer is already assigned to another overlapping shift',
      });
    case 'AVAILABILITY_NOT_CONFIRMED':
    case 'UNAVAILABLE':
      throw new Error(`${refusal} is a proposal-only refusal`);
  }
}

// ── Facts ───────────────────────────────────────────────────────────────────

function filledCount({
  assignments,
  requirementId,
  excludeId,
}: FilledInput): number {
  return assignments.filter(
    (other) =>
      other.id !== excludeId &&
      other.shiftRequirementId === requirementId &&
      isActiveAssignmentStatus(other.status),
  ).length;
}

/** Loads, once and under the caller's locks, the facts eligibility reads. */
export class AssignmentFactsReader implements IAssignmentFactsReader {
  private readonly assignmentRepository: AssignmentRepository;
  private readonly shiftRepository: ShiftRepository;
  private readonly eventRepository: EventRepository;
  private readonly eventTimeBlockRepository: EventTimeBlockRepository;
  private readonly volunteerRepository: VolunteerRepository;
  private readonly unavailableShiftRepository: UnavailableShiftRepository;

  constructor({
    assignmentRepository,
    shiftRepository,
    eventRepository,
    eventTimeBlockRepository,
    volunteerRepository,
    unavailableShiftRepository,
  }: AssignmentFactsReaderDependencies) {
    this.assignmentRepository = assignmentRepository;
    this.shiftRepository = shiftRepository;
    this.eventRepository = eventRepository;
    this.eventTimeBlockRepository = eventTimeBlockRepository;
    this.volunteerRepository = volunteerRepository;
    this.unavailableShiftRepository = unavailableShiftRepository;
  }

  /** Facts for placing a Volunteer on a need: manual assign and reassign. */
  async forAssign({
    churchId,
    participation,
    shiftId,
    shiftRequirementId,
    volunteerId,
    replacingId,
    tx,
  }: LoadAssignFactsInput): Promise<AssignFacts> {
    const shift = await this.shiftRepository.getById({
      churchId,
      shiftId,
      tx,
    });
    // Read under the caller's Church lock, after any cancellation committed.
    const event = await this.eventRepository.getById({
      churchId,
      eventId: participation.eventId,
      tx,
    });
    const eventTimeBlock = await this.eventTimeBlockRepository.getById({
      churchId,
      eventTimeBlockId: shift.eventTimeBlockId,
      tx,
    });
    let requirement: ShiftRequirement | null = null;
    let requirementError: Error | null = null;
    try {
      requirement = await this.shiftRepository.getRequirementForShift({
        churchId,
        shiftId: shift.id,
        shiftRequirementId,
        tx,
      });
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
      requirementError = error;
    }
    const { ministryId } = participation;
    const isMember = await this.volunteerRepository.hasMembershipInMinistry({
      churchId,
      volunteerId,
      ministryId,
      tx,
    });
    const qualified =
      requirement !== null &&
      (await this.volunteerRepository.hasRoleQualification({
        churchId,
        volunteerId,
        ministryId,
        roleId: requirement.roleId,
        tx,
      }));
    const shiftAssignments = await this.assignmentRepository.listByShift({
      churchId,
      shiftId: shift.id,
      tx,
    });
    const unavailableShifts =
      await this.unavailableShiftRepository.listByVolunteers({
        churchId,
        volunteerIds: [volunteerId],
        tx,
      });
    const overlapping = await this.assignmentRepository.listByVolunteerInRange({
      churchId,
      volunteerId,
      startTime: toDate({ instant: shift.startTime }),
      endTime: toDate({ instant: shift.endTime }),
      tx,
    });
    return {
      requirementError,
      eligibility: {
        now: now(),
        shift,
        requirement,
        bookings: await this.bookingsOf({
          churchId,
          shift,
          shiftAssignments,
          volunteerId,
          overlapping,
          tx,
        }),
        facts: {
          cancelledBy: eventTimeBlockCancellation({ event, eventTimeBlock }),
          isMember,
          roleIds: qualified && requirement ? [requirement.roleId] : [],
          unavailableShiftIds: unavailableShifts.map(
            (mark) => mark.shiftId as ShiftId,
          ),
          filled: requirement
            ? filledCount({
                assignments: shiftAssignments,
                requirementId: requirement.id,
                excludeId: replacingId,
              })
            : 0,
        },
      },
    };
  }

  /** Facts for moving an Assignment to another need of its Shift and Role. */
  async forMove({
    churchId,
    current,
    shiftRequirementId,
    tx,
  }: LoadMoveFactsInput): Promise<AssignmentEligibility> {
    if (!current.participationId || !current.shiftId)
      throw new Error('Assignment is missing its schedule reference');
    const shift = await this.shiftRepository.getById({
      churchId,
      shiftId: current.shiftId,
      tx,
    });
    const requirements =
      await this.shiftRepository.listRequirementsByParticipation({
        churchId,
        participationId: current.participationId,
        tx,
      });
    const found = requirements.find(({ id }) => id === shiftRequirementId);
    const target =
      found &&
      found.shiftId === current.shiftId &&
      found.roleId === current.roleId
        ? found
        : null;
    const shiftAssignments = await this.assignmentRepository.listByShift({
      churchId,
      shiftId: shift.id,
      tx,
    });
    return {
      now: now(),
      shift,
      requirement: target,
      bookings: shiftAssignments
        .filter(
          (other) =>
            other.id !== current.id &&
            other.volunteerId === current.volunteerId &&
            isActiveAssignmentStatus(other.status),
        )
        .map(() => shift),
      // A move keeps its Volunteer, so only the place rules apply.
      facts: {
        cancelledBy: null,
        isMember: true,
        roleIds: [current.roleId],
        unavailableShiftIds: [],
        filled: target
          ? filledCount({
              assignments: shiftAssignments,
              requirementId: target.id,
              excludeId: current.id,
            })
          : 0,
      },
    };
  }

  /** The Shifts of the Volunteer's active Assignments on this Shift and on any overlapping one. */
  private async bookingsOf({
    churchId,
    shift,
    shiftAssignments,
    volunteerId,
    overlapping,
    tx,
  }: BookingsInput): Promise<Shift[]> {
    const onShift = shiftAssignments
      .filter(
        (assignment) =>
          assignment.volunteerId === volunteerId &&
          isActiveAssignmentStatus(assignment.status),
      )
      .map(() => shift);
    const otherShiftIds = new Set(
      overlapping.flatMap((assignment) =>
        assignment.shiftId &&
        assignment.shiftId !== shift.id &&
        isActiveAssignmentStatus(assignment.status)
          ? [assignment.shiftId]
          : [],
      ),
    );
    // A Volunteer has at most a few Assignments overlapping one Shift.
    const elsewhere: Shift[] = [];
    for (const shiftId of otherShiftIds)
      elsewhere.push(
        await this.shiftRepository.getById({ churchId, shiftId, tx }),
      );
    return [...onShift, ...elsewhere];
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

export class AssignmentLifecycle implements IAssignmentLifecycle {
  private readonly assignmentRepository: AssignmentRepository;
  private readonly auditRepository: AssignmentAuditRepository;
  private readonly swapRequestRepository: SwapRequestRepository;
  private readonly participationRepository: MinistryParticipationRepository;

  constructor({
    assignmentRepository,
    auditRepository,
    swapRequestRepository,
    participationRepository,
  }: AssignmentLifecycleDependencies) {
    this.assignmentRepository = assignmentRepository;
    this.auditRepository = auditRepository;
    this.swapRequestRepository = swapRequestRepository;
    this.participationRepository = participationRepository;
  }

  /** Throws the entry point's error for the refusal that takes precedence. */
  admit({ check, eligibility, notOnShift }: AdmitInput): void {
    const refusal = findAssignmentRefusal({ check, eligibility });
    if (refusal) throw refusalError({ refusal, notOnShift });
  }

  /** Refuses a change once the Shift has started; it is fixed from then on. */
  assertNotStarted({ shift }: ShiftStartGuardInput): void {
    if (shift.hasStarted({ now: now() })) throw new ShiftStartedError();
  }

  /**
   * Manual assign and reassign: refuses with today's errors, or adds a
   * `pending` Assignment, audits it and starts assigning. An unavailable mark
   * only warns.
   */
  async assign({
    churchId,
    participation,
    volunteerId,
    actorId,
    facts: loaded,
    tx,
  }: AssignInput): Promise<CreateParticipationAssignmentResult> {
    const { eligibility, requirementError } = loaded;
    const { shift, requirement } = eligibility;
    this.admit({
      check: 'manual',
      eligibility,
      notOnShift: () => requirementError ?? new Error('Missing requirement'),
    });
    if (!requirement) throw requirementError;
    const assignment = await this.add({
      churchId,
      shift,
      shiftRequirementId: requirement.id,
      volunteerId,
      actorId,
      tx,
    });
    await this.startAssigning({ churchId, participation, tx });
    return {
      assignment,
      warnings: isMarkedUnavailable(eligibility)
        ? [
            {
              type: 'UNAVAILABLE' as const,
              details: 'Volunteer is marked unavailable for this shift',
            },
          ]
        : [],
    };
  }

  /** A `pending` Assignment with its `created` audit; eligibility was checked by the caller. */
  async add({
    churchId,
    shift,
    shiftRequirementId,
    volunteerId,
    actorId,
    correlationId,
    tx,
  }: AddAssignmentInput): Promise<Assignment> {
    const assignment = await this.assignmentRepository.create({
      churchId,
      input: {
        eventTimeBlockId: shift.eventTimeBlockId,
        participationId: shift.participationId,
        shiftId: shift.id,
        volunteerId,
        shiftRequirementId,
        status: 'pending',
        assignedBy: actorId,
      },
      tx,
    });
    await this.auditRepository.create({
      churchId,
      input: {
        assignmentId: assignment.id,
        actorId,
        action: 'created',
        ...(correlationId ? { correlationId } : {}),
      },
      tx,
    });
    return assignment;
  }

  /** The first Assignment moves a Schedule from availability requested to assigning. */
  async startAssigning({
    churchId,
    participation,
    tx,
  }: StartAssigningInput): Promise<void> {
    if (participation.state !== 'availability_requested') return;
    participation.startAssigning();
    await this.participationRepository.updateState({
      churchId,
      participationId: participation.id,
      state: participation.state,
      tx,
    });
  }

  /** Reassign's exit for the replaced one: covers its request, deletes it, audits the replacement. */
  async replace({
    churchId,
    replacedId,
    replacement,
    actorId,
    tx,
  }: ReplaceAssignmentInput): Promise<void> {
    await this.swapRequestRepository.closeOpenByAssignment({
      churchId,
      assignmentId: replacedId,
      status: 'covered',
      closedBy: actorId,
      tx,
    });
    await this.assignmentRepository.deleteById({
      churchId,
      assignmentId: replacedId,
      tx,
    });
    await this.auditRepository.create({
      churchId,
      input: { assignmentId: replacement.id, actorId, action: 'updated' },
      tx,
    });
  }

  /** Rebinds the Assignment to another need; a move never carries its request along. */
  async move({
    churchId,
    assignmentId,
    shiftRequirementId,
    actorId,
    tx,
  }: MoveAssignmentInput): Promise<Assignment> {
    await this.swapRequestRepository.closeOpenByAssignment({
      churchId,
      assignmentId,
      status: 'covered',
      closedBy: actorId,
      tx,
    });
    const moved = await this.assignmentRepository.move({
      churchId,
      assignmentId,
      shiftRequirementId,
      tx,
    });
    await this.auditRepository.create({
      churchId,
      input: { assignmentId, actorId, action: 'updated' },
      tx,
    });
    return moved;
  }

  /**
   * The established Assignment removal, shared by a leader's removal and a
   * move's clash withdrawal: audit it, close an open SwapRequest as `covered`,
   * then hard-delete it. The caller holds the Assignment's Participation lock.
   */
  async remove({
    churchId,
    assignmentId,
    actorId,
    tx,
  }: LifecycleExitInput): Promise<void> {
    await this.auditRepository.create({
      churchId,
      input: { assignmentId, actorId, action: 'deleted' },
      tx,
    });
    await this.swapRequestRepository.closeOpenByAssignment({
      churchId,
      assignmentId,
      status: 'covered',
      closedBy: actorId,
      tx,
    });
    await this.assignmentRepository.deleteById({ churchId, assignmentId, tx });
  }

  /**
   * An Event or EventTimeBlock cancellation's Assignment write: keep the row as
   * `cancelled` for history (never Remove Assignment's hard delete), audit it as
   * `event_cancelled` by the acting User and close an open SwapRequest through
   * Spec 28's `covered` close, which sends no N8 (only a `kept` answer does).
   * The caller holds the Church and Participation locks. True when it closed a
   * request.
   */
  async cancel({
    churchId,
    assignmentId,
    actorId,
    tx,
  }: LifecycleExitInput): Promise<boolean> {
    await this.assignmentRepository.updateStatus({
      churchId,
      assignmentId,
      input: { status: 'cancelled' },
      tx,
    });
    await this.auditRepository.create({
      churchId,
      input: { assignmentId, actorId, action: 'event_cancelled' },
      tx,
    });
    return this.swapRequestRepository.closeOpenByAssignment({
      churchId,
      assignmentId,
      status: 'covered',
      closedBy: actorId,
      tx,
    });
  }
}
