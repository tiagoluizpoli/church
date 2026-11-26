import { now } from '@church/time';
import type { RoleId } from '../domain/branded-ids';
import type { IAssignmentLifecycle } from '../domain/contracts/application/assignment-lifecycle';
import type {
  ApplyAssignmentProposalInput,
  AssignmentProposalOutcomeView,
  AssignmentProposalView,
  DbAssignmentProposalManagerDependencies,
  GetAssignmentProposalInput,
  IAssignmentProposalManager,
  LoadProposalFactsInput,
  ProposalFacts,
  RefuseCancelledAdditionsInput,
  ToProposalAssignmentsInput,
} from '../domain/contracts/application/assignment-proposal-manager';
import type { IParticipationReader } from '../domain/contracts/application/participation-reader';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AssignmentProposalApplicationRepository } from '../domain/contracts/infrastructure/assignment-proposal-application.repository';
import type { AvailabilityCheckRepository } from '../domain/contracts/infrastructure/availability-check.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import {
  type Assignment,
  isActiveAssignmentStatus,
} from '../domain/entities/assignment';
import type { MinistryParticipation } from '../domain/entities/ministry-participation';
import type { Shift } from '../domain/entities/shift';
import { IllegalStateTransitionError } from '../domain/errors';
import {
  AssignmentProposalChangedError,
  AssignmentProposalExclusionInvalidError,
  AssignmentProposalStaleError,
  ScheduleAlreadyPublishedError,
} from '../domain/errors/schedule-publish';
import {
  assertEventTimeBlockNotCancelled,
  isEventTimeBlockCancelled,
} from '../domain/event-time-block-cancellation';
import {
  type AppliedProposalAddition,
  findStaleAdditions,
  type ProposalAssignment,
  type ProposalNeed,
  type ProposalShift,
  type ProposalVolunteer,
  proposalReviewTokenFor,
  proposeAssignments,
  type ReviewedAddition,
} from '../domain/services/assignment-proposal';

/** One entry per Assignment; only target-Schedule ones name a need. */
function toProposalAssignments({
  scheduleAssignments,
  candidateAssignments,
  shiftsById,
  cycleBlockIds,
}: ToProposalAssignmentsInput): ProposalAssignment[] {
  const scheduleIds = new Set(scheduleAssignments.map(({ id }) => id));
  const byId = new Map<string, ProposalAssignment>();
  for (const assignment of [...scheduleAssignments, ...candidateAssignments]) {
    const shift = assignment.shiftId && shiftsById.get(assignment.shiftId);
    if (!shift || byId.has(assignment.id)) continue;
    byId.set(assignment.id, {
      volunteerId: assignment.volunteerId,
      shiftId: shift.id,
      startTime: shift.startTime,
      endTime: shift.endTime,
      shiftRequirementId: scheduleIds.has(assignment.id)
        ? assignment.shiftRequirementId
        : undefined,
      inCycle: cycleBlockIds.has(assignment.eventTimeBlockId as string),
    });
  }
  return [...byId.values()];
}

export class DbAssignmentProposalManager implements IAssignmentProposalManager {
  private readonly assignmentRepository: AssignmentRepository;
  private readonly availabilityCheckRepository: AvailabilityCheckRepository;
  private readonly cycleRepository: CycleRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly lifecycle: IAssignmentLifecycle;
  private readonly ministryRepository: MinistryRepository;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly proposalApplicationRepository: AssignmentProposalApplicationRepository;
  private readonly shiftRepository: ShiftRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly participationReader: IParticipationReader;

  constructor({
    assignmentRepository,
    availabilityCheckRepository,
    cycleRepository,
    eventRepository,
    assignmentLifecycle,
    ministryRepository,
    participationRepository,
    proposalApplicationRepository,
    shiftRepository,
    unitOfWork,
    participationReader,
  }: DbAssignmentProposalManagerDependencies) {
    this.assignmentRepository = assignmentRepository;
    this.availabilityCheckRepository = availabilityCheckRepository;
    this.cycleRepository = cycleRepository;
    this.eventRepository = eventRepository;
    this.lifecycle = assignmentLifecycle;
    this.ministryRepository = ministryRepository;
    this.participationRepository = participationRepository;
    this.proposalApplicationRepository = proposalApplicationRepository;
    this.shiftRepository = shiftRepository;
    this.unitOfWork = unitOfWork;
    this.participationReader = participationReader;
  }

  async getAssignmentProposal(
    input: GetAssignmentProposalInput,
  ): Promise<AssignmentProposalView> {
    const { churchId, cycleId, ministryId } = input;
    await this.ministryRepository.getById({ churchId, id: ministryId });
    await this.cycleRepository.getById({ churchId, cycleId });

    return this.unitOfWork.run(async (tx) => {
      const { facts, nameByVolunteer } = await this.loadProposalFacts({
        ...input,
        tx,
      });
      const proposal = proposeAssignments(facts);
      return {
        ...proposal,
        additions: proposal.additions.map((addition) => ({
          ...addition,
          volunteerName: nameByVolunteer.get(addition.volunteerId) ?? '',
        })),
        reviewToken: proposalReviewTokenFor({
          cycleId,
          ministryId,
          additions: proposal.additions,
        }),
      };
    });
  }

  async applyAssignmentProposal(
    input: ApplyAssignmentProposalInput,
  ): Promise<AssignmentProposalOutcomeView> {
    const {
      churchId,
      cycleId,
      ministryId,
      actorId,
      applicationKey,
      reviewToken,
      additions: reviewed,
      excludedAdditions,
    } = input;
    // 404 short-circuits only; the Ministry is re-read, locked, in the transaction.
    await this.ministryRepository.getById({ churchId, id: ministryId });
    await this.cycleRepository.getById({ churchId, cycleId });

    return this.unitOfWork.run(async (tx) => {
      // The pairs must be the reviewed ones, on first attempts and replays.
      const submittedToken = proposalReviewTokenFor({
        cycleId,
        ministryId,
        additions: reviewed,
      });
      if (submittedToken !== reviewToken)
        throw new AssignmentProposalChangedError();
      // Exclusions only drop reviewed pairs; they never add or edit one.
      const pairKey = (pair: ReviewedAddition) =>
        `${pair.shiftRequirementId as string}:${pair.volunteerId as string}`;
      const reviewedKeys = new Set(reviewed.map(pairKey));
      const excludedKeys = new Set(excludedAdditions.map(pairKey));
      const additions = reviewed.filter(
        (pair) => !excludedKeys.has(pairKey(pair)),
      );
      if (
        [...excludedKeys].some((key) => !reviewedKeys.has(key)) ||
        additions.length === 0
      )
        throw new AssignmentProposalExclusionInvalidError();
      // Manual creation's Church lock: a double click or retry waits here
      // for the first attempt, then recovers what it committed.
      await this.cycleRepository.acquireChurchLock({ churchId, tx });
      const committed = await this.proposalApplicationRepository.find({
        churchId,
        applicationKey,
        tx,
      });
      if (committed) {
        const appliedKeys = new Set(committed.additions.map(pairKey));
        const sameReview =
          committed.reviewToken === reviewToken &&
          appliedKeys.size === additions.length &&
          additions.every((pair) => appliedKeys.has(pairKey(pair))) &&
          committed.cycleId === cycleId &&
          committed.ministryId === ministryId;
        if (!sameReview) throw new AssignmentProposalChangedError();
        const { appliedAt } = committed;
        return {
          applicationKey,
          appliedAt,
          replayed: true,
          additions: committed.additions,
        };
      }
      await this.participationRepository.lockSchedule({
        churchId,
        ministryId,
        cycleId,
        tx,
      });
      // Adding Assignments is new use: archive waits for this to commit, or
      // commits first and this refuses the archived Ministry.
      await this.ministryRepository.lockActive({
        churchId,
        ministryId,
        strength: 'share',
        tx,
      });
      const eventGroups = await this.eventRepository.listCycleEvents({
        churchId,
        cycleId,
        tx,
      });
      await this.refuseCancelledAdditions({
        churchId,
        eventGroups,
        additions,
        tx,
      });
      const { facts, shifts, proposable } = await this.loadProposalFacts({
        churchId,
        cycleId,
        ministryId,
        eventGroups,
        tx,
      });
      const stale = findStaleAdditions({ facts, additions });
      if (stale.length > 0) throw new AssignmentProposalStaleError();

      const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
      const shiftIdByNeed = new Map(
        facts.needs.map(({ shiftRequirementId, shiftId }) => [
          shiftRequirementId,
          shiftId,
        ]),
      );
      const applied: AppliedProposalAddition[] = [];
      const touchedParticipationIds = new Set<string>();
      for (const { shiftRequirementId, volunteerId } of additions) {
        const shiftId = shiftIdByNeed.get(shiftRequirementId);
        const shift = shiftId && shiftById.get(shiftId);
        // Unreachable: findStaleAdditions refused unknown needs.
        if (!shift) throw new AssignmentProposalStaleError();
        const created = await this.lifecycle.add({
          churchId,
          shift,
          shiftRequirementId,
          volunteerId,
          actorId,
          correlationId: applicationKey,
          tx,
        });
        applied.push({
          assignmentId: created.id,
          shiftRequirementId,
          volunteerId,
        });
        touchedParticipationIds.add(shift.participationId as string);
      }
      // As manual creation does: the first Assignment starts assigning.
      for (const participation of proposable) {
        if (touchedParticipationIds.has(participation.id as string))
          await this.lifecycle.startAssigning({ churchId, participation, tx });
      }

      const application = await this.proposalApplicationRepository.create({
        application: {
          churchId,
          applicationKey,
          cycleId,
          ministryId,
          reviewToken,
          additions: applied,
          appliedBy: actorId,
        },
        tx,
      });
      const { appliedAt } = application;
      return { applicationKey, appliedAt, replayed: false, additions: applied };
    });
  }

  /** Names the cancellation an addition targets, as manual assign does, before staleness. */
  private async refuseCancelledAdditions({
    churchId,
    eventGroups,
    additions,
    tx,
  }: RefuseCancelledAdditionsInput): Promise<void> {
    const requirements = await this.shiftRepository.listRequirementsByIds({
      churchId,
      shiftRequirementIds: additions.map(
        ({ shiftRequirementId }) => shiftRequirementId,
      ),
      tx,
    });
    const targets = await this.shiftRepository.listConflictFacts({
      churchId,
      shiftIds: [
        ...new Set(
          requirements.flatMap(({ shiftId }) => (shiftId ? [shiftId] : [])),
        ),
      ],
      tx,
    });
    const targetBlockIds = new Set(
      targets.map(({ shift }) => shift.eventTimeBlockId as string),
    );
    for (const { event, eventTimeBlocks } of eventGroups)
      for (const eventTimeBlock of eventTimeBlocks)
        if (targetBlockIds.has(eventTimeBlock.id as string))
          assertEventTimeBlockNotCancelled({ event, eventTimeBlock });
  }

  /** The Schedule's proposal facts; refuses outside availability requested/assigning. */
  private async loadProposalFacts({
    churchId,
    cycleId,
    ministryId,
    eventGroups: loadedEventGroups,
    tx,
  }: LoadProposalFactsInput): Promise<ProposalFacts> {
    const eventGroups =
      loadedEventGroups ??
      (await this.eventRepository.listCycleEvents({ churchId, cycleId, tx }));
    const cycleBlockIds = new Set<string>(
      eventGroups.flatMap(({ eventTimeBlocks }) =>
        eventTimeBlocks.map(({ id }) => id as string),
      ),
    );
    const cancelledBlockIds = new Set<string>(
      eventGroups.flatMap(({ event, eventTimeBlocks }) =>
        eventTimeBlocks
          .filter((eventTimeBlock) =>
            isEventTimeBlockCancelled({ event, eventTimeBlock }),
          )
          .map(({ id }) => id as string),
      ),
    );

    // Between Ask and Publish only: the same stages Publish accepts.
    const proposable: MinistryParticipation[] = [];
    let publishedCount = 0;
    for (const { event } of eventGroups) {
      if (event.status === 'cancelled') continue;
      const participation =
        await this.participationRepository.findByMinistryEvent({
          churchId,
          ministryId,
          eventId: event.id,
          tx,
        });
      if (participation?.state === 'published') publishedCount += 1;
      if (
        participation?.state === 'availability_requested' ||
        participation?.state === 'assigning'
      )
        proposable.push(participation);
    }
    if (proposable.length === 0 && publishedCount > 0)
      throw new ScheduleAlreadyPublishedError();
    if (proposable.length === 0)
      throw new IllegalStateTransitionError({
        from: 'prepare',
        to: 'proposal',
      });

    const shifts: Shift[] = [];
    const needs: ProposalNeed[] = [];
    const scheduleAssignments: Assignment[] = [];
    for (const participation of proposable) {
      const [participationShifts, requirements, assignments] =
        await Promise.all([
          this.shiftRepository.listByParticipation({
            churchId,
            participationId: participation.id,
            tx,
          }),
          this.shiftRepository.listRequirementsByParticipation({
            churchId,
            participationId: participation.id,
            tx,
          }),
          this.assignmentRepository.listByParticipation({
            churchId,
            participationId: participation.id,
            tx,
          }),
        ]);
      shifts.push(...participationShifts);
      scheduleAssignments.push(
        ...assignments.filter(({ status }) => isActiveAssignmentStatus(status)),
      );
      for (const { id, shiftId, roleId, peopleNeeded } of requirements) {
        if (shiftId)
          needs.push({
            shiftRequirementId: id,
            shiftId,
            roleId,
            peopleNeeded,
          });
      }
    }

    // Only Volunteers asked this Cycle are candidates; unconfirmed ones are counted.
    const memberships =
      await this.availabilityCheckRepository.listActiveMemberships({
        churchId,
        ministryId,
        tx,
      });
    const checks =
      memberships.length === 0
        ? []
        : await this.availabilityCheckRepository.listByCycle({
            churchId,
            cycleId,
            ministryMembershipIds: memberships.map(
              ({ ministryMembershipId }) => ministryMembershipId,
            ),
            tx,
          });
    const checkStateByMembership = new Map(
      checks.map(({ ministryMembershipId, state }) => [
        ministryMembershipId,
        state,
      ]),
    );
    const asked = memberships.filter(({ ministryMembershipId }) =>
      checkStateByMembership.has(ministryMembershipId),
    );
    const membershipInfo =
      await this.participationReader.listVolunteerMembershipInfo({
        churchId,
        ministryId,
        tx,
      });
    const { activeAssignments, assignmentShiftsById, unavailableShiftKeys } =
      await this.participationReader.loadCandidateFacts({
        churchId,
        volunteerIds: asked.map(({ volunteerId }) => volunteerId),
        tx,
      });

    const volunteers: ProposalVolunteer[] = asked.map(
      ({ ministryMembershipId, volunteerId }) => ({
        volunteerId,
        roleIds: (membershipInfo.get(volunteerId as string)?.qualifiedRoleIds ??
          []) as RoleId[],
        availability:
          checkStateByMembership.get(ministryMembershipId) === 'confirmed'
            ? 'confirmed'
            : 'not_confirmed',
        unavailableShiftIds: shifts
          .filter(({ id }) =>
            unavailableShiftKeys.has(
              `${volunteerId as string}:${id as string}`,
            ),
          )
          .map(({ id }) => id),
      }),
    );
    const proposalShifts: ProposalShift[] = shifts.map((shift) => ({
      shiftId: shift.id,
      startTime: shift.startTime,
      endTime: shift.endTime,
      cancelled: cancelledBlockIds.has(shift.eventTimeBlockId as string),
    }));
    const proposalAssignments = toProposalAssignments({
      scheduleAssignments,
      candidateAssignments: activeAssignments,
      shiftsById: new Map([
        ...assignmentShiftsById,
        ...shifts.map((shift): [string, Shift] => [shift.id as string, shift]),
      ]),
      cycleBlockIds,
    });

    return {
      facts: {
        now: now(),
        shifts: proposalShifts,
        needs,
        volunteers,
        assignments: proposalAssignments,
      },
      nameByVolunteer: new Map(
        memberships.map(({ volunteerId, volunteerName }) => [
          volunteerId,
          volunteerName,
        ]),
      ),
      shifts,
      proposable,
    };
  }
}
