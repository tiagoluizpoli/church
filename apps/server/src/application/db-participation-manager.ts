import { NotFoundError } from '@church/core';
import {
  compareCalendarDays,
  compareInstants,
  fromDate,
  type Instant,
  now,
  today,
} from '@church/time';
import type {
  ChurchId,
  EventTimeBlockId,
  MinistryId,
  RoleId,
  SectorId,
  VolunteerId,
} from '../domain/branded-ids';
import type { IChurchNotifications } from '../domain/contracts/application/church-notifications';
import type {
  CycleBuilderEventTimeBlockView,
  CycleBuilderEventView,
  CycleBuilderRequirementView,
  CycleBuilderRoleOption,
  CycleBuilderShiftView,
  CycleBuilderView,
  CycleParticipationView,
  EligibleVolunteerView,
  GetCycleBuilderDataInput,
  GetCycleParticipationInput,
  GetParticipationCompletionInput,
  IParticipationManager,
  ListEligibleVolunteersInput,
  ListScheduleSummariesInput,
  ListSchedulesInput,
  ListUsualSetupBlocksInput,
  ParticipationCompletionView,
  ParticipationEventTimeBlockView,
  ParticipationEventView,
  ParticipationShiftView,
  PublishCycleInput,
  PublishCycleParticipationOutcome,
  PublishCycleView,
  SavePreparationInput,
  SaveUsualSetupBlockInput,
  ScheduleSummaryView,
  ScheduleView,
  SendScheduleUpdatesView,
  UsualSetupBlockView,
} from '../domain/contracts/application/participation-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AvailabilityCheckRepository } from '../domain/contracts/infrastructure/availability-check.repository';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { EventTemplateRepository } from '../domain/contracts/infrastructure/event-template.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type {
  MinistryParticipationRepository,
  ScheduleCountRow,
  ScheduleLastToldRow,
} from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { SectorRepository } from '../domain/contracts/infrastructure/sector.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { SwapRequestRepository } from '../domain/contracts/infrastructure/swap-request.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnavailableShiftRepository } from '../domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { UsualSetupRepository } from '../domain/contracts/infrastructure/usual-setup.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Assignment } from '../domain/entities/assignment';
import type { Cycle } from '../domain/entities/cycle';
import type { Event, EventWithEventTimeBlocks } from '../domain/entities/event';
import type { EventTemplate } from '../domain/entities/event-template';
import type { EventTimeBlock } from '../domain/entities/event-time-block';
import type { MinistryAccessLevel } from '../domain/entities/ministry-membership';
import {
  calculateCompletionPercent,
  deriveScheduleStage,
  type MinistryParticipation,
} from '../domain/entities/ministry-participation';
import type { Shift } from '../domain/entities/shift';
import type { ShiftRequirement } from '../domain/entities/shift-requirement';
import type { TemplateTimeBlock } from '../domain/entities/template-time-block';
import type { UnavailableShift } from '../domain/entities/unavailable-shift';
import {
  assertManualSplitFitsBlock,
  assertUniqueHeadcounts,
  assertValidHeadcounts,
  assertValidUsualSetupProps,
  toSaveableUsualSetupEntry,
  type UsualSetup,
  type UsualSetupHeadcount,
} from '../domain/entities/usual-setup';
import { IllegalStateTransitionError } from '../domain/errors';
import { HeadcountBelowAssignedError } from '../domain/errors/headcount-below-assigned';
import { InvalidShiftIndexError } from '../domain/errors/invalid-shift-index';
import { InvalidShiftSplitError } from '../domain/errors/invalid-shift-split';
import { PreparationEmptyError } from '../domain/errors/preparation-empty';
import {
  NoUnsentChangesError,
  ScheduleAlreadyPublishedError,
  ScheduleHasNoAssignmentsError,
} from '../domain/errors/schedule-publish';
import { ShiftHasResponsesError } from '../domain/errors/shift-has-responses';
import { scheduleChanges } from '../domain/schedule-changes';
import type { ScheduleAssignmentSnapshot } from '../domain/schedule-last-told';
import {
  type ShiftSplitStrategy,
  ShiftSplitter,
} from '../domain/services/shift-splitter';
import {
  spansFitBlock,
  splitFitsBlock,
  wallClockUtcBounds,
} from '../domain/services/usual-setup-planner';
import type { UsualSetupStaffingSeeder } from './usual-setup-staffing-seeder';

interface TagCoveredSwapRequestsInput {
  baseline: ScheduleLastToldRow[];
  churchId: ChurchId;
  tx: TransactionContext;
}

interface CompareScheduleAssignmentsInput {
  events: EventWithEventTimeBlocks[];
  baseline: ScheduleLastToldRow[];
  current: Map<VolunteerId, ScheduleAssignmentSnapshot[]>;
  at: Instant;
}

function compareScheduleAssignments({
  events,
  baseline,
  current,
  at,
}: CompareScheduleAssignmentsInput) {
  const cancelled = new Set(
    events
      .filter(({ event }) => event.status === 'cancelled')
      .map(({ event }) => event.id),
  );
  const old = new Map(
    baseline.map((row) => [
      row.volunteerId,
      row.assignments.filter((item) => !cancelled.has(item.eventId)),
    ]),
  );
  const ids = new Set([...old.keys(), ...current.keys()]);
  return [...ids]
    .map((id) => ({
      id,
      changes: scheduleChanges({
        before: old.get(id) ?? [],
        after: current.get(id) ?? [],
        at,
      }),
    }))
    .filter(({ changes }) => changes.length > 0);
}

interface GetOrCreateParticipationInput extends GetCycleParticipationInput {
  eventId: EventWithEventTimeBlocks['event']['id'];
  tx: TransactionContext;
}

interface EnsurePreparationEditableInput {
  cycle: Cycle;
  timeZone: string;
}

interface PreparationTarget {
  churchId: ChurchId;
  participation: MinistryParticipation;
  eventTimeBlock: EventTimeBlock;
  tx: TransactionContext;
}

interface OptInPreparationInput extends PreparationTarget {
  timeZone: string;
}

interface DiscardPreparationInput extends PreparationTarget {
  existingShifts: Shift[];
}

interface ApplyPreparationGraphInput extends PreparationTarget {
  existingShifts: Shift[];
  shiftSplit?: ShiftSplitStrategy;
  headcounts: UsualSetupHeadcount[];
}

interface ApplyShiftChangeInput extends PreparationTarget {
  updateLabels: boolean;
  desiredShifts: Shift[];
  change: ShiftChange;
}

interface ReconcileRequirementsInput extends PreparationTarget {
  current: ShiftRequirement[];
  desired: DesiredRequirement[];
}

interface LoadShiftResponsesInput {
  churchId: ChurchId;
  participationId: MinistryParticipation['id'];
  tx?: TransactionContext;
}

interface RequirementPlace {
  shiftId: Shift['id'] | undefined;
  sectorId: SectorId;
  roleId: RoleId;
}

interface DesiredRequirement extends RequirementPlace {
  shiftId: Shift['id'];
  peopleNeeded: number;
}

interface LoadEventViewInput {
  churchId: ChurchId;
  eventGroup: EventWithEventTimeBlocks;
  participation: MinistryParticipation;
  availabilityRequestedAt: Date | null;
  tx: TransactionContext;
}

interface LoadPreparationViewInput extends PreparationTarget {
  event: Event;
}

interface ResolveParticipationEventTimeBlockInput {
  churchId: GetCycleParticipationInput['churchId'];
  participation: MinistryParticipation;
  eventTimeBlockId: EventTimeBlockId;
  tx?: TransactionContext;
}

interface BuildEventViewInput {
  eventGroup: EventWithEventTimeBlocks;
  participation: MinistryParticipation;
  includedEventTimeBlockIds: Set<string>;
  shifts: Shift[];
  requirements: ShiftRequirement[];
  marks: UnavailableShift[];
  assignments: Assignment[];
  availabilityRequestedAt: Date | null;
}

interface GetParticipationCompletionInternalInput {
  churchId: GetParticipationCompletionInput['churchId'];
  participationId: GetParticipationCompletionInput['participationId'];
  tx?: TransactionContext;
}

interface BuildEligibleVolunteerViewInput {
  volunteerId: string;
  volunteerName: string;
  answerState: EligibleVolunteerView['answerState'];
  conflict: EligibleVolunteerView['conflict'];
  lastServedAt?: Instant;
  qualifiedRoleIds: string[];
  ministryAccessLevel: MinistryAccessLevel;
}

interface QualifiedVolunteerRef {
  id: EligibleVolunteerView['volunteerId'];
  name?: string | null;
}

/**
 * Per-volunteer membership facts read once per cycle/shift lookup and reused
 * across every shift — qualification and ministry-wide access level.
 */
interface VolunteerMembershipInfo {
  qualifiedRoleIds: string[];
  ministryAccessLevel: MinistryAccessLevel;
}

interface BuildEligibleForVolunteerInput {
  volunteer: QualifiedVolunteerRef;
  shift: Shift;
  activeAssignments: Assignment[];
  fairnessAssignments: Assignment[];
  assignmentShiftsById: Map<string, Shift>;
  unavailableShiftKeys: Set<string>;
  membershipInfoByVolunteerId: Map<string, VolunteerMembershipInfo>;
  checkStates: Map<string, 'pending' | 'confirmed'>;
  conflictDetails: Map<
    string,
    Omit<NonNullable<EligibleVolunteerView['conflict']>, 'assignmentId'>
  >;
}

interface ListVolunteerMembershipInfoInput {
  churchId: ChurchId;
  ministryId: MinistryParticipation['ministryId'];
  tx?: TransactionContext;
}

interface LoadCheckStatesInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: Cycle['id'];
  tx?: TransactionContext;
}

interface LoadCandidateFactsInput {
  churchId: ChurchId;
  volunteerIds: VolunteerId[];
  tx?: TransactionContext;
}

interface CandidateFacts {
  activeAssignments: Assignment[];
  assignmentShiftsById: Map<string, Shift>;
  unavailableShiftKeys: Set<string>;
  conflictDetails: Map<
    string,
    Omit<NonNullable<EligibleVolunteerView['conflict']>, 'assignmentId'>
  >;
}

interface SortEligibleVolunteersInput {
  eligible: EligibleVolunteerView[];
  assignments: Assignment[];
}

interface ListEligibleForShiftsInput {
  candidateFacts: CandidateFacts;
  churchId: ChurchId;
  participation: MinistryParticipation;
  shifts: Shift[];
  requirements: ShiftRequirement[];
  membershipInfoByVolunteerId: Map<string, VolunteerMembershipInfo>;
  checkStates: Map<string, 'pending' | 'confirmed'>;
  tx?: TransactionContext;
}

interface ListQualifiedVolunteersForShiftInput {
  churchId: ListEligibleVolunteersInput['churchId'];
  participation: MinistryParticipation;
  requirements: ShiftRequirement[];
  tx?: TransactionContext;
}

interface BuildBuilderEventViewInput {
  eventGroup: EventWithEventTimeBlocks;
  participation: MinistryParticipation;
  includedEventTimeBlockIds: Set<string>;
  shifts: Shift[];
  requirements: ShiftRequirement[];
  assignments: Assignment[];
  marks: UnavailableShift[];
  eligibleByShift: Map<string, EligibleVolunteerView[]>;
}

interface PublishCandidate {
  participation: MinistryParticipation;
  completion: ParticipationCompletionView;
}

interface ScheduleScopeInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  cycleId: GetCycleBuilderDataInput['cycleId'];
}

interface CountScheduleChangesInput extends ScheduleScopeInput {
  tx: TransactionContext;
}

interface CollectScheduleAssignmentsInput {
  input: ScheduleScopeInput;
  participations: MinistryParticipation[];
  events: EventWithEventTimeBlocks[];
  tx: TransactionContext;
}

interface NotifySchedulePublishedInput {
  input: PublishCycleInput;
  candidates: PublishCandidate[];
  events: EventWithEventTimeBlocks[];
  tx: TransactionContext;
}

interface ScheduleKeyInput {
  ministryId: string;
  cycleId: string;
}

function scheduleKey({ ministryId, cycleId }: ScheduleKeyInput): string {
  return `${ministryId}:${cycleId}`;
}

interface DbParticipationManagerDependencies {
  availabilityCheckRepository: AvailabilityCheckRepository;
  participationRepository: MinistryParticipationRepository;
  shiftRepository: ShiftRepository;
  eventRepository: PlanningEventRepository;
  assignmentRepository: AssignmentRepository;
  unavailableShiftRepository: UnavailableShiftRepository;
  eventTimeBlockRepository: EventTimeBlockRepository;
  volunteerRepository: VolunteerRepository;
  ministryRepository: MinistryRepository;
  usualSetupRepository: UsualSetupRepository;
  eventTemplateRepository: EventTemplateRepository;
  cycleRepository: CycleRepository;
  roleRepository: RoleRepository;
  sectorRepository: SectorRepository;
  churchRepository: ChurchRepository;
  swapRequestRepo: SwapRequestRepository;
  staffingSeeder: UsualSetupStaffingSeeder;
  notifications: IChurchNotifications;
  unitOfWork: UnitOfWork;
}

interface HeadcountPlace {
  sectorId: SectorId;
  roleId: RoleId;
}

interface AssertMinistryHeadcountsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  headcounts: HeadcountPlace[];
  tx: TransactionContext;
}

export class DbParticipationManager implements IParticipationManager {
  private readonly splitter = new ShiftSplitter();

  private readonly availabilityCheckRepository: AvailabilityCheckRepository;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly shiftRepository: ShiftRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly assignmentRepository: AssignmentRepository;
  private readonly unavailableShiftRepository: UnavailableShiftRepository;
  private readonly eventTimeBlockRepository: EventTimeBlockRepository;
  private readonly volunteerRepository: VolunteerRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly usualSetupRepository: UsualSetupRepository;
  private readonly eventTemplateRepository: EventTemplateRepository;
  private readonly cycleRepository: CycleRepository;
  private readonly roleRepository: RoleRepository;
  private readonly sectorRepository: SectorRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly swapRequestRepo: SwapRequestRepository;
  private readonly staffingSeeder: UsualSetupStaffingSeeder;
  private readonly notifications: IChurchNotifications;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    availabilityCheckRepository,
    participationRepository,
    shiftRepository,
    eventRepository,
    assignmentRepository,
    unavailableShiftRepository,
    eventTimeBlockRepository,
    volunteerRepository,
    ministryRepository,
    usualSetupRepository,
    eventTemplateRepository,
    cycleRepository,
    roleRepository,
    sectorRepository,
    churchRepository,
    swapRequestRepo,
    staffingSeeder,
    notifications,
    unitOfWork,
  }: DbParticipationManagerDependencies) {
    this.availabilityCheckRepository = availabilityCheckRepository;
    this.swapRequestRepo = swapRequestRepo;
    this.participationRepository = participationRepository;
    this.shiftRepository = shiftRepository;
    this.eventRepository = eventRepository;
    this.assignmentRepository = assignmentRepository;
    this.unavailableShiftRepository = unavailableShiftRepository;
    this.eventTimeBlockRepository = eventTimeBlockRepository;
    this.volunteerRepository = volunteerRepository;
    this.ministryRepository = ministryRepository;
    this.usualSetupRepository = usualSetupRepository;
    this.eventTemplateRepository = eventTemplateRepository;
    this.cycleRepository = cycleRepository;
    this.roleRepository = roleRepository;
    this.sectorRepository = sectorRepository;
    this.churchRepository = churchRepository;
    this.staffingSeeder = staffingSeeder;
    this.notifications = notifications;
    this.unitOfWork = unitOfWork;
  }

  async getCycleParticipation(
    input: GetCycleParticipationInput,
  ): Promise<CycleParticipationView> {
    const ministry = await this.ministryRepository.getById({
      churchId: input.churchId,
      id: input.ministryId,
    });
    // Prepare excludes archived Ministries even when participation already exists.
    if (ministry.deletedAt)
      throw new NotFoundError(`Ministry not found: ${input.ministryId}`);
    await this.cycleRepository.getById({
      churchId: input.churchId,
      cycleId: input.cycleId,
    });

    return this.unitOfWork.run(async (tx) => {
      const eventGroups = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });
      const availabilityRequestedAt =
        await this.participationRepository.findAvailabilityRequestedAt({
          churchId: input.churchId,
          cycleId: input.cycleId,
          ministryId: input.ministryId,
          tx,
        });
      const events: ParticipationEventView[] = [];

      for (const eventGroup of eventGroups) {
        const participation = await this.getOrCreateParticipation({
          ...input,
          eventId: eventGroup.event.id,
          tx,
        });
        events.push(
          await this.loadEventView({
            churchId: input.churchId,
            eventGroup,
            participation,
            availabilityRequestedAt,
            tx,
          }),
        );
      }

      return { events };
    });
  }

  private async loadEventView({
    churchId,
    eventGroup,
    participation,
    availabilityRequestedAt,
    tx,
  }: LoadEventViewInput): Promise<ParticipationEventView> {
    const scope = { churchId, participationId: participation.id, tx };
    const [inclusions, shifts, requirements, marks, assignments] =
      await Promise.all([
        this.participationRepository.listInclusions(scope),
        this.shiftRepository.listByParticipation(scope),
        this.shiftRepository.listRequirementsByParticipation(scope),
        this.unavailableShiftRepository.listByParticipation(scope),
        this.assignmentRepository.listByParticipation(scope),
      ]);

    return buildEventView({
      eventGroup,
      participation,
      includedEventTimeBlockIds: new Set(
        inclusions.map((inclusion) => inclusion.eventTimeBlockId as string),
      ),
      shifts,
      requirements,
      marks,
      assignments,
      availabilityRequestedAt,
    });
  }

  async getCycleBuilderData(
    input: GetCycleBuilderDataInput,
  ): Promise<CycleBuilderView> {
    await this.ministryRepository.getById({
      churchId: input.churchId,
      id: input.ministryId,
    });
    const cycle = await this.cycleRepository.getById({
      churchId: input.churchId,
      cycleId: input.cycleId,
    });
    return this.unitOfWork.run(async (tx) => {
      const affectedVolunteerCount = await this.countScheduleChanges({
        ...input,
        tx,
      });
      const eventGroups = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });
      const roles = await this.roleRepository.listByMinistry({
        churchId: input.churchId,
        ministryId: input.ministryId,
        tx,
      });
      // One membership read for the whole cycle: every event in it belongs to
      // the same ministry, so hoisting this out of the loop keeps it O(1).
      const membershipInfoByVolunteerId =
        await this.listVolunteerMembershipInfo({
          churchId: input.churchId,
          ministryId: input.ministryId,
          tx,
        });

      const checkStates = await this.loadCheckStates({
        churchId: input.churchId,
        ministryId: input.ministryId,
        cycleId: input.cycleId,
        tx,
      });
      const candidateFacts = await this.loadCandidateFacts({
        churchId: input.churchId,
        volunteerIds: [...membershipInfoByVolunteerId.keys()] as VolunteerId[],
        tx,
      });
      const events: CycleBuilderEventView[] = [];

      for (const eventGroup of eventGroups) {
        const participation = await this.getOrCreateParticipation({
          churchId: input.churchId,
          cycleId: input.cycleId,
          ministryId: input.ministryId,
          eventId: eventGroup.event.id,
          tx,
        });
        const [inclusions, shifts, requirements, assignments, marks] =
          await Promise.all([
            this.participationRepository.listInclusions({
              churchId: input.churchId,
              participationId: participation.id,
              tx,
            }),
            this.shiftRepository.listByParticipation({
              churchId: input.churchId,
              participationId: participation.id,
              tx,
            }),
            this.shiftRepository.listRequirementsByParticipation({
              churchId: input.churchId,
              participationId: participation.id,
              tx,
            }),
            this.assignmentRepository.listByParticipation({
              churchId: input.churchId,
              participationId: participation.id,
              tx,
            }),
            this.unavailableShiftRepository.listByParticipation({
              churchId: input.churchId,
              participationId: participation.id,
              tx,
            }),
          ]);

        // Query B — eligible volunteers batched over all this participation's
        // shifts at once (never N+1). Published participations still include
        // candidates because leaders may reassign after publication.
        const eligibleByShift = await this.listEligibleVolunteersForShifts({
          churchId: input.churchId,
          participation,
          shifts,
          requirements,
          membershipInfoByVolunteerId,
          checkStates,
          candidateFacts,
          tx,
        });

        events.push(
          buildBuilderEventView({
            eventGroup,
            participation,
            includedEventTimeBlockIds: new Set(
              inclusions.map(
                (inclusion) => inclusion.eventTimeBlockId as string,
              ),
            ),
            shifts,
            requirements,
            assignments,
            marks,
            eligibleByShift,
          }),
        );
      }

      const roleOptions: CycleBuilderRoleOption[] = roles.map((role) => ({
        id: role.id,
        name: role.name,
      }));

      return { cycle, events, roles: roleOptions, affectedVolunteerCount };
    });
  }

  /**
   * A Sector or Role outside the Ministry (or Church) is not found (#385),
   * and so is an archived Role. The active Roles stay share-locked until `tx`
   * ends, so a concurrent Role archive sees this write or this write sees it.
   */
  private async assertMinistryHeadcounts({
    churchId,
    ministryId,
    headcounts,
    tx,
  }: AssertMinistryHeadcountsInput): Promise<void> {
    if (headcounts.length === 0) return;
    // Locked, not just read: an archived Sector or Role is not found for new
    // use, and a concurrent archive cannot slip between this check and the write.
    const [sectorIds, roles] = await Promise.all([
      this.sectorRepository.lockActive({
        churchId,
        ministryId,
        sectorIds: headcounts.map(({ sectorId }) => sectorId),
        tx,
      }),
      this.roleRepository.lockActiveForUse({
        churchId,
        ministryId,
        roleIds: headcounts.map(({ roleId }) => roleId),
        tx,
      }),
    ]);
    const roleIds = new Set<string>(roles.map((role) => role.id));
    for (const { sectorId, roleId } of headcounts) {
      if (!sectorIds.has(sectorId)) {
        throw new NotFoundError(`Sector not found: ${sectorId}`);
      }
      if (!roleIds.has(roleId)) {
        throw new NotFoundError(`Role not found: ${roleId}`);
      }
    }
  }

  async savePreparation({
    churchId,
    participationId,
    eventTimeBlockId,
    serves,
    shiftSplit,
    headcounts,
  }: SavePreparationInput): Promise<ParticipationEventTimeBlockView> {
    const { timezone: timeZone } = await this.churchRepository.getById({
      id: churchId,
    });

    return this.unitOfWork.run(async (tx) => {
      // Serializes saves of this participation and holds its state until commit.
      const participation = await this.participationRepository.lockById({
        churchId,
        participationId,
        tx,
      });
      // An archived Ministry is not found for new use.
      await this.ministryRepository.lockActive({
        churchId,
        ministryId: participation.ministryId,
        strength: 'share',
        tx,
      });
      const eventTimeBlock = await this.resolveParticipationEventTimeBlock({
        churchId,
        participation,
        eventTimeBlockId,
        tx,
      });
      const event = await this.eventRepository.getEvent({
        churchId,
        eventId: participation.eventId,
        tx,
      });
      const cycle = await this.cycleRepository.getById({
        churchId,
        cycleId: event.cycleId,
        tx,
      });
      ensurePreparationEditable({ cycle, timeZone });

      const target = { churchId, participation, eventTimeBlock, tx };
      // Locked so a racing answer or Assignment is counted below, never cascaded away.
      const existingShifts = await this.shiftRepository.listByEventTimeBlock({
        churchId,
        participationId,
        eventTimeBlockId,
        forUpdate: true,
        tx,
      });

      if (!serves) {
        await this.discardPreparation({ ...target, existingShifts });
      } else if (
        existingShifts.length === 0 &&
        !shiftSplit &&
        headcounts === undefined
      ) {
        await this.optInPreparation({ ...target, timeZone });
      } else {
        await this.applyPreparationGraph({
          ...target,
          existingShifts,
          shiftSplit,
          headcounts: headcounts ?? [],
        });
      }

      await this.participationRepository.touch({
        churchId,
        participationId,
        tx,
      });

      return this.loadPreparationView({ ...target, event });
    });
  }

  private async discardPreparation({
    churchId,
    participation,
    eventTimeBlock,
    existingShifts,
    tx,
  }: DiscardPreparationInput): Promise<void> {
    const block = {
      churchId,
      participationId: participation.id,
      eventTimeBlockId: eventTimeBlock.id,
      tx,
    };
    assertNoShiftResponses({
      shifts: existingShifts,
      responses: await this.loadShiftResponses(block),
    });
    await this.shiftRepository.deleteByEventTimeBlock(block);
    await this.participationRepository.removeInclusion(block);
  }

  /** Re-seeds from a serving Usual setup entry, else one whole-block Shift that reads flagged. */
  private async optInPreparation({
    churchId,
    participation,
    eventTimeBlock,
    timeZone,
    tx,
  }: OptInPreparationInput): Promise<void> {
    const seeded = await this.staffingSeeder.seedParticipationBlock({
      churchId,
      participation,
      block: {
        eventId: eventTimeBlock.eventId,
        eventTimeBlockId: eventTimeBlock.id,
        sourceTemplateTimeBlockId: eventTimeBlock.sourceTemplateTimeBlockId,
        startTime: eventTimeBlock.startTime,
        endTime: eventTimeBlock.endTime,
      },
      setup: await this.staffingSeeder.loadSetup({ churchId, timeZone, tx }),
      tx,
    });
    if (seeded) return;

    await this.participationRepository.addInclusion({
      churchId,
      participationId: participation.id,
      eventTimeBlockId: eventTimeBlock.id,
      tx,
    });
    const shifts = this.splitter.split({
      churchId,
      participationId: participation.id,
      eventTimeBlock,
      strategy: { kind: 'equal-n', n: 1 },
    });
    await this.shiftRepository.createMany({ churchId, shifts, tx });
  }

  /** Validates the submitted graph completely, then writes it over the block. */
  private async applyPreparationGraph({
    existingShifts,
    shiftSplit,
    headcounts,
    ...target
  }: ApplyPreparationGraphInput): Promise<void> {
    const { churchId, participation, eventTimeBlock, tx } = target;
    // A zero row is an omission, but it still may not repeat a place.
    assertUniqueHeadcounts({ headcounts });
    if (!shiftSplit) {
      throw new PreparationEmptyError();
    }
    const positive = headcounts.filter(({ peopleNeeded }) => peopleNeeded > 0);
    assertValidHeadcounts({ headcounts: positive });
    if (
      shiftSplit.kind === 'manual' &&
      !spansFitBlock({ spans: shiftSplit.spans, block: eventTimeBlock })
    ) {
      throw new InvalidShiftSplitError(
        'manual spans must be chronological, must not overlap and must lie within the block',
      );
    }
    const desiredShifts = this.splitter.split({
      churchId,
      participationId: participation.id,
      eventTimeBlock,
      strategy: shiftSplit,
    });
    if (positive.some(({ shiftIndex }) => shiftIndex >= desiredShifts.length)) {
      throw new InvalidShiftIndexError();
    }

    const change = diffShifts({ existingShifts, desiredShifts });
    const participationId = participation.id;
    const responses = await this.loadShiftResponses({
      churchId,
      participationId,
      tx,
    });
    assertNoShiftResponses({
      // Flow 6: adding beside an answered Shift is a re-split whatever its shape;
      // a pure delete affects only the Shifts it removes.
      shifts: change.added.length > 0 ? existingShifts : change.removed,
      responses,
    });
    const shiftIds = new Set<string | undefined>(
      change.shifts.map((shift) => shift.id),
    );
    const allRequirements =
      await this.shiftRepository.listRequirementsByParticipation({
        churchId,
        participationId,
        tx,
      });
    const current = allRequirements.filter((requirement) =>
      shiftIds.has(requirement.shiftId),
    );
    const desired = positive.flatMap(({ shiftIndex, ...headcount }) => {
      const shift = change.shifts[shiftIndex];
      return shift ? [{ ...headcount, shiftId: shift.id }] : [];
    });
    assertHeadcountFloors({ current, desired, responses });
    if (positive.length === 0) {
      throw new PreparationEmptyError();
    }
    await this.assertMinistryHeadcounts({
      churchId,
      ministryId: participation.ministryId,
      headcounts: positive,
      tx,
    });

    await this.applyShiftChange({
      ...target,
      desiredShifts,
      change,
      updateLabels: shiftSplit.kind === 'manual',
    });
    await this.participationRepository.addInclusion({
      churchId,
      participationId: participation.id,
      eventTimeBlockId: eventTimeBlock.id,
      tx,
    });
    await this.reconcileRequirements({ ...target, current, desired });
  }

  private async loadShiftResponses({
    churchId,
    participationId,
    tx,
  }: LoadShiftResponsesInput): Promise<ShiftResponses> {
    const scope = { churchId, participationId, tx };
    const [marks, assignments] = await Promise.all([
      this.unavailableShiftRepository.listByParticipation(scope),
      this.assignmentRepository.listByParticipation(scope),
    ]);
    return countShiftResponses({ marks, assignments });
  }

  /** The same spans keep their Shifts, so answers and Assignments stay attached. */
  private async applyShiftChange({
    churchId,
    desiredShifts,
    updateLabels,
    change: { shifts, added, removed },
    tx,
  }: ApplyShiftChangeInput): Promise<void> {
    for (const { id: shiftId } of removed) {
      await this.shiftRepository.deleteById({ churchId, shiftId, tx });
    }
    await this.shiftRepository.createMany({ churchId, shifts: added, tx });
    // Equal splits cannot express labels; only the manual editor can change them.
    if (!updateLabels) return;
    for (const [index, shift] of shifts.entries()) {
      const label = desiredShifts[index]?.label;
      if (added.includes(shift) || shift.label === label) continue;
      await this.shiftRepository.update({
        churchId,
        shiftId: shift.id,
        label: label ?? null,
        tx,
      });
    }
  }

  /** Omission removes a requirement; a kept pair keeps its id and notes. */
  private async reconcileRequirements({
    churchId,
    participation,
    current,
    desired,
    tx,
  }: ReconcileRequirementsInput): Promise<void> {
    const participationId = participation.id;
    const desiredPlaces = new Set(desired.map(placeOf));

    await this.shiftRepository.deleteRequirements({
      churchId,
      shiftRequirementIds: current
        .filter((requirement) => !desiredPlaces.has(placeOf(requirement)))
        .map((requirement) => requirement.id),
      tx,
    });

    const notesByPlace = new Map(
      current.map((requirement) => [placeOf(requirement), requirement.notes]),
    );
    for (const place of desired) {
      await this.shiftRepository.saveRequirement({
        ...place,
        churchId,
        participationId,
        notes: notesByPlace.get(placeOf(place)),
        tx,
      });
    }
  }

  private async loadPreparationView({
    churchId,
    participation,
    eventTimeBlock,
    event,
    tx,
  }: LoadPreparationViewInput): Promise<ParticipationEventTimeBlockView> {
    const availabilityRequestedAt =
      await this.participationRepository.findAvailabilityRequestedAt({
        churchId,
        cycleId: event.cycleId,
        ministryId: participation.ministryId,
        tx,
      });
    const { eventTimeBlocks } = await this.loadEventView({
      churchId,
      eventGroup: { event, eventTimeBlocks: [eventTimeBlock] },
      participation,
      availabilityRequestedAt,
      tx,
    });
    const [view] = eventTimeBlocks;
    if (!view) {
      throw new NotFoundError(`EventTimeBlock not found: ${eventTimeBlock.id}`);
    }
    return view;
  }

  async listUsualSetupBlocks({
    churchId,
    ministryId,
  }: ListUsualSetupBlocksInput): Promise<UsualSetupBlockView[]> {
    const [templates, entries] = await Promise.all([
      this.eventTemplateRepository.list({ churchId }),
      this.usualSetupRepository.listByMinistry({ churchId, ministryId }),
    ]);
    const entriesByBlock = new Map(
      entries.map((entry) => [entry.sourceTemplateTimeBlockId, entry]),
    );
    const byName = [...templates].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    return byName.flatMap((template) =>
      template.blocks.map((block) =>
        toUsualSetupBlockView({
          template,
          block,
          entry: entriesByBlock.get(block.id),
        }),
      ),
    );
  }

  async saveUsualSetupBlock({
    churchId,
    ministryId,
    entry,
  }: SaveUsualSetupBlockInput): Promise<UsualSetupBlockView> {
    const saveable = toSaveableUsualSetupEntry({ entry });
    // The entity's own rules (split shape, positive counts, unique places).
    assertValidUsualSetupProps(saveable);

    return this.unitOfWork.run(async (tx) => {
      // Saving a setup is new use: refused for an archived Ministry.
      await this.ministryRepository.lockActive({
        churchId,
        ministryId,
        strength: 'share',
        tx,
      });
      // Any same-Church block is valid; another Church's is indistinguishable from a missing one.
      const templates = await this.eventTemplateRepository.list({
        churchId,
        tx,
      });
      const located = templates.flatMap((template) =>
        template.blocks
          .filter((block) => block.id === saveable.sourceTemplateTimeBlockId)
          .map((block) => ({ template, block })),
      );
      const [target] = located;
      if (!target) {
        throw new NotFoundError(
          `Template time block not found: ${saveable.sourceTemplateTimeBlockId}`,
        );
      }
      assertManualSplitFitsBlock({
        shiftSplit: saveable.shiftSplit,
        blockStartTime: target.block.startTime,
        blockEndTime: target.block.endTime,
      });
      await this.assertMinistryHeadcounts({
        churchId,
        ministryId,
        headcounts: saveable.headcounts,
        tx,
      });
      const saved = await this.usualSetupRepository.upsertBlock({
        churchId,
        ministryId,
        entry: saveable,
        tx,
      });
      return toUsualSetupBlockView({ ...target, entry: saved });
    });
  }

  async listEligibleVolunteers(
    input: ListEligibleVolunteersInput,
  ): Promise<EligibleVolunteerView[]> {
    return this.unitOfWork.run(async (tx) => {
      const shift = await this.shiftRepository.getById({
        churchId: input.churchId,
        shiftId: input.shiftId,
        tx,
      });
      const participation = await this.participationRepository.getById({
        churchId: input.churchId,
        participationId: shift.participationId,
        tx,
      });
      const requirements =
        await this.shiftRepository.listRequirementsByParticipation({
          churchId: input.churchId,
          participationId: participation.id,
          tx,
        });
      const shiftRequirements = requirements.filter(
        (requirement) => requirement.shiftId === shift.id,
      );
      const qualifiedVolunteers = await this.listQualifiedVolunteersForShift({
        churchId: input.churchId,
        participation,
        requirements: shiftRequirements,
        tx,
      });
      const membershipInfoByVolunteerId =
        await this.listVolunteerMembershipInfo({
          churchId: input.churchId,
          ministryId: participation.ministryId,
          tx,
        });
      const event = await this.eventRepository.getEvent({
        churchId: input.churchId,
        eventId: participation.eventId,
        tx,
      });
      const checkStates = await this.loadCheckStates({
        churchId: input.churchId,
        ministryId: participation.ministryId,
        cycleId: event.cycleId,
        tx,
      });
      const volunteerIds = qualifiedVolunteers.map((volunteer) => volunteer.id);
      const {
        activeAssignments,
        assignmentShiftsById,
        unavailableShiftKeys,
        conflictDetails,
      } = await this.loadCandidateFacts({
        churchId: input.churchId,
        volunteerIds,
        tx,
      });
      const eligible = qualifiedVolunteers.map((volunteer) =>
        buildEligibleForVolunteer({
          volunteer,
          shift,
          activeAssignments,
          fairnessAssignments: activeAssignments,
          assignmentShiftsById,
          unavailableShiftKeys,
          membershipInfoByVolunteerId,
          checkStates,
          conflictDetails,
        }),
      );

      return sortEligibleVolunteers({
        eligible,
        assignments: activeAssignments,
      });
    });
  }

  async getCompletion(
    input: GetParticipationCompletionInput,
  ): Promise<ParticipationCompletionView> {
    return this.unitOfWork.run((tx) =>
      this.getCompletionInternal({
        churchId: input.churchId,
        participationId: input.participationId,
        tx,
      }),
    );
  }

  async publishCycle(input: PublishCycleInput): Promise<PublishCycleView> {
    await this.ministryRepository.getById({
      churchId: input.churchId,
      id: input.ministryId,
    });
    const cycle = await this.cycleRepository.getById({
      churchId: input.churchId,
      cycleId: input.cycleId,
    });

    const church = await this.churchRepository.getById({ id: input.churchId });
    if (
      cycle.state !== 'sent' ||
      compareCalendarDays({
        left: cycle.endDate,
        right: today({ instant: now(), timeZone: church.timezone }),
      }) < 0
    ) {
      throw new IllegalStateTransitionError({
        from: cycle.state,
        to: 'published',
      });
    }

    return this.unitOfWork.run(async (tx) => {
      const eventGroups = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });

      // Use the shared Schedule lock order used by other Schedule mutations.
      const lockedParticipations =
        await this.participationRepository.lockSchedule({
          churchId: input.churchId,
          ministryId: input.ministryId,
          cycleId: input.cycleId,
          tx,
        });

      // Only availability-requested / assign participations are publishable;
      // prepare ones are not yet assigned and already-published ones are
      // reported unchanged.
      const publishable: PublishCandidate[] = [];
      const alreadyPublished: PublishCandidate[] = [];

      for (const eventGroup of eventGroups) {
        if (eventGroup.event.status === 'cancelled') continue;
        const participation = lockedParticipations.find(
          (item) => item.eventId === eventGroup.event.id,
        );
        if (!participation) continue;
        const completion = await this.getCompletionInternal({
          churchId: input.churchId,
          participationId: participation.id,
          tx,
        });
        if (participation.state === 'published') {
          alreadyPublished.push({ participation, completion });
        } else if (
          participation.state === 'availability_requested' ||
          participation.state === 'assigning'
        ) {
          publishable.push({ participation, completion });
        }
      }

      if (publishable.length === 0 && alreadyPublished.length > 0) {
        throw new ScheduleAlreadyPublishedError();
      }
      if (publishable.length === 0) {
        throw new IllegalStateTransitionError({
          from: 'prepare',
          to: 'published',
        });
      }
      if (
        ![...publishable, ...alreadyPublished].some(
          ({ completion }) => completion.assignedCount > 0,
        )
      ) {
        throw new ScheduleHasNoAssignmentsError();
      }

      const anyBelowFull = publishable.some(
        (candidate) => candidate.completion.completionPercent < 100,
      );

      // Below-full without confirmation: reject the whole batch, no writes.
      if (anyBelowFull && input.confirmBelowFull !== true) {
        return {
          published: false,
          belowFull: true,
          participations: [...publishable, ...alreadyPublished].map(
            toPublishCycleOutcome,
          ),
        };
      }

      for (const { participation, completion } of publishable) {
        if (participation.state === 'availability_requested') {
          participation.startAssigning();
        }
        participation.publish({
          completionPercent: completion.completionPercent,
          confirmBelowFull: true,
        });
        await this.participationRepository.updateState({
          churchId: input.churchId,
          participationId: participation.id,
          state: participation.state,
          tx,
        });
      }

      await this.notifySchedulePublished({
        input,
        candidates: [...publishable, ...alreadyPublished],
        events: eventGroups,
        tx,
      });

      return {
        published: true,
        belowFull: anyBelowFull,
        participations: [...publishable, ...alreadyPublished].map(
          toPublishCycleOutcome,
        ),
      };
    });
  }

  async sendScheduleUpdates(
    input: PublishCycleInput,
  ): Promise<SendScheduleUpdatesView> {
    await this.ministryRepository.getById({
      churchId: input.churchId,
      id: input.ministryId,
    });
    await this.cycleRepository.getById({
      churchId: input.churchId,
      cycleId: input.cycleId,
    });
    return this.unitOfWork.run(async (tx) => {
      const participations = await this.participationRepository.lockSchedule({
        ...input,
        tx,
      });
      if (participations.length === 0)
        throw new NotFoundError('Schedule not found');
      const events = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });
      const published = participations.filter(
        (item) =>
          item.state === 'published' &&
          events.some(
            ({ event }) =>
              event.id === item.eventId && event.status !== 'cancelled',
          ),
      );
      const current = await this.collectScheduleAssignments({
        input,
        participations: published,
        events,
        tx,
      });
      const lastTold = await this.participationRepository.listScheduleLastTold({
        ...input,
        tx,
      });
      const baseline = await this.tagCoveredSwapRequests({
        baseline: lastTold,
        churchId: input.churchId,
        tx,
      });
      const changed = compareScheduleAssignments({
        events,
        baseline,
        current,
        at: now(),
      });
      if (changed.length === 0) throw new NoUnsentChangesError();
      const [church, ministry, cycle, volunteers] = await Promise.all([
        this.churchRepository.getById({ id: input.churchId }),
        this.ministryRepository.getById({
          churchId: input.churchId,
          id: input.ministryId,
          tx,
        }),
        this.cycleRepository.getById({
          churchId: input.churchId,
          cycleId: input.cycleId,
          tx,
        }),
        this.volunteerRepository.listByIds({
          churchId: input.churchId,
          ids: changed.map(({ id }) => id),
          tx,
        }),
      ]);
      if (volunteers.length !== changed.length)
        throw new NotFoundError('An assigned Volunteer could not be found');
      const ids = new Set([
        ...baseline.map(({ volunteerId }) => volunteerId),
        ...current.keys(),
      ]);
      for (const id of ids) {
        await this.participationRepository.saveScheduleLastTold({
          churchId: input.churchId,
          ministryId: input.ministryId,
          cycleId: input.cycleId,
          volunteerId: id,
          assignments: current.get(id) ?? [],
          tx,
        });
      }
      for (const volunteer of volunteers) {
        const changes = changed.find(({ id }) => id === volunteer.id)?.changes;
        if (!changes) throw new NotFoundError('Volunteer changes not found');
        await this.notifications.enqueue({
          tx,
          kind: 'schedule_updated',
          to: [{ userId: volunteer.userId, churchId: input.churchId }],
          data: {
            cycleId: cycle.id,
            cycleName: cycle.name,
            ministryId: ministry.id,
            ministryName: ministry.name,
            churchName: church.name,
            churchTimezone: church.timezone,
            changes,
          },
        });
      }
      return { notifiedCount: changed.length };
    });
  }

  /** A told Assignment whose latest request was covered after the last send is being changed by that cover. */
  private async tagCoveredSwapRequests({
    baseline,
    churchId,
    tx,
  }: TagCoveredSwapRequestsInput): Promise<ScheduleLastToldRow[]> {
    const tagRow = async (row: ScheduleLastToldRow) => {
      const tagItem = async (item: ScheduleAssignmentSnapshot) => {
        const latest = await this.swapRequestRepo.findLatestByAssignment({
          churchId,
          assignmentId: item.assignmentId,
          tx,
        });
        const coveredSinceTold =
          latest?.status === 'covered' &&
          latest.closedAt !== undefined &&
          compareInstants({ left: latest.closedAt, right: row.toldAt }) > 0;
        return coveredSinceTold ? { ...item, swapRequestCovered: true } : item;
      };
      const assignments = await Promise.all(row.assignments.map(tagItem));
      return { ...row, assignments };
    };
    return Promise.all(baseline.map(tagRow));
  }

  private async notifySchedulePublished({
    input,
    candidates,
    events,
    tx,
  }: NotifySchedulePublishedInput): Promise<void> {
    const [church, ministry, cycle] = await Promise.all([
      this.churchRepository.getById({ id: input.churchId }),
      this.ministryRepository.getById({
        churchId: input.churchId,
        id: input.ministryId,
        tx,
      }),
      this.cycleRepository.getById({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      }),
    ]);
    const byVolunteer = await this.collectScheduleAssignments({
      input,
      participations: candidates.map(({ participation }) => participation),
      events,
      tx,
    });
    const volunteers = await this.volunteerRepository.listByIds({
      churchId: input.churchId,
      ids: [...byVolunteer.keys()],
      tx,
    });
    if (volunteers.length !== byVolunteer.size) {
      throw new NotFoundError('An assigned Volunteer could not be found');
    }
    for (const volunteer of volunteers) {
      const assignments = byVolunteer.get(volunteer.id);
      if (!assignments) continue;
      await this.participationRepository.saveScheduleLastTold({
        churchId: input.churchId,
        ministryId: input.ministryId,
        cycleId: input.cycleId,
        volunteerId: volunteer.id,
        assignments,
        tx,
      });
      await this.notifications.enqueue({
        tx,
        kind: 'schedule_published',
        to: [{ userId: volunteer.userId, churchId: input.churchId }],
        data: {
          cycleId: cycle.id,
          cycleName: cycle.name,
          ministryId: ministry.id,
          ministryName: ministry.name,
          churchName: church.name,
          churchTimezone: church.timezone,
          shifts: assignments.map(
            ({ eventTitle, startsAt, endsAt, roleName, sectorName }) => ({
              eventTitle,
              startsAt,
              endsAt,
              roleName,
              sectorName,
            }),
          ),
        },
      });
    }
  }

  private async collectScheduleAssignments({
    input,
    participations,
    events,
    tx,
  }: CollectScheduleAssignmentsInput): Promise<
    Map<VolunteerId, ScheduleAssignmentSnapshot[]>
  > {
    const byVolunteer = new Map<VolunteerId, ScheduleAssignmentSnapshot[]>();
    for (const participation of participations) {
      const event = events.find(
        (group) => group.event.id === participation.eventId,
      )?.event;
      if (!event) throw new NotFoundError('Schedule Event not found');
      const [assignments, shifts, requirements] = await Promise.all([
        this.assignmentRepository.listByParticipation({
          churchId: input.churchId,
          participationId: participation.id,
          tx,
        }),
        this.shiftRepository.listByParticipation({
          churchId: input.churchId,
          participationId: participation.id,
          tx,
        }),
        this.shiftRepository.listRequirementsByParticipation({
          churchId: input.churchId,
          participationId: participation.id,
          tx,
        }),
      ]);
      for (const assignment of assignments.filter((item) =>
        isActiveAssignmentStatus(item.status),
      )) {
        const shift = shifts.find((item) => item.id === assignment.shiftId);
        const requirement = requirements.find(
          (item) => item.id === assignment.shiftRequirementId,
        );
        if (!shift || !requirement)
          throw new NotFoundError('Assignment Shift or requirement not found');
        const role = await this.roleRepository.getById({
          churchId: input.churchId,
          id: assignment.roleId,
          tx,
        });
        const facts: ScheduleAssignmentSnapshot = {
          assignmentId: assignment.id,
          shiftId: shift.id,
          eventId: event.id,
          eventTitle: event.title,
          eventStart: event.start,
          eventEnd: event.end,
          startsAt: shift.startTime,
          endsAt: shift.endTime,
          roleId: role.id,
          roleName: role.name,
          sectorId: requirement.sectorId,
          sectorName: requirement.sectorName,
        };
        const own = byVolunteer.get(assignment.volunteerId) ?? [];
        own.push(facts);
        byVolunteer.set(assignment.volunteerId, own);
      }
    }
    return byVolunteer;
  }

  private async countScheduleChanges(
    input: CountScheduleChangesInput,
  ): Promise<number> {
    const { tx } = input;
    {
      const events = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });
      const participations: MinistryParticipation[] = [];
      for (const { event } of events) {
        if (event.status === 'cancelled') continue;
        const participation =
          await this.participationRepository.findByMinistryEvent({
            churchId: input.churchId,
            ministryId: input.ministryId,
            eventId: event.id,
            tx,
          });
        if (participation?.state !== 'published') continue;
        participations.push(participation);
      }
      if (participations.length === 0) return 0;
      const [current, baseline] = await Promise.all([
        this.collectScheduleAssignments({ input, participations, events, tx }),
        this.participationRepository.listScheduleLastTold({ ...input, tx }),
      ]);
      return compareScheduleAssignments({
        events,
        baseline,
        current,
        at: now(),
      }).length;
    }
  }

  async listScheduleSummaries(
    input: ListScheduleSummariesInput,
  ): Promise<ScheduleSummaryView[]> {
    await this.ministryRepository.getById({
      churchId: input.churchId,
      id: input.ministryId,
    });

    const rows = await this.participationRepository.listScheduleSummaries({
      churchId: input.churchId,
      ministryId: input.ministryId,
    });

    return rows.map((row) => ({
      cycleId: row.cycleId as ScheduleSummaryView['cycleId'],
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      isPartOf: row.isPartOf,
      eventCount: row.eventCount,
      eventTimeBlockCount: row.eventTimeBlockCount,
      status: row.status,
      availabilityRequestedForAll: row.availabilityRequestedForAll,
      availabilityRequestedForAny: row.availabilityRequestedForAny,
    }));
  }

  async listSchedules({
    churchId,
    ministryIds: scopedMinistryIds,
  }: ListSchedulesInput): Promise<ScheduleView[]> {
    const [ministries, cycles] = await Promise.all([
      this.ministryRepository.listByChurch({
        churchId,
        ids: scopedMinistryIds,
      }),
      this.cycleRepository.list({ churchId }),
    ]);
    const sentCycles = cycles.filter((cycle) => cycle.state !== 'draft');
    if (ministries.length === 0 || sentCycles.length === 0) return [];

    const scope = {
      churchId,
      ministryIds: ministries.map((ministry) => ministry.id),
      cycleIds: sentCycles.map((cycle) => cycle.id),
    };
    const [servingStates, checkCounts, lateMarkCounts, swapCounts] =
      await Promise.all([
        this.participationRepository.listScheduleServingStates(scope),
        this.participationRepository.countScheduleChecks(scope),
        this.participationRepository.countScheduleLateMarks(scope),
        this.participationRepository.countScheduleOpenSwapRequests(scope),
      ]);
    const countEntry = (row: ScheduleCountRow): [string, number] => [
      scheduleKey(row),
      row.count,
    ];
    const swapCountBySchedule = new Map(swapCounts.map(countEntry));
    const lateMarksBySchedule = new Map(lateMarkCounts.map(countEntry));
    const statesBySchedule = Map.groupBy(servingStates, scheduleKey);
    const countsBySchedule = new Map(
      checkCounts.map((row) => [scheduleKey(row), row]),
    );

    return Promise.all(
      sentCycles.flatMap((cycle) =>
        ministries.map(async (ministry) => {
          const key = scheduleKey({
            ministryId: ministry.id,
            cycleId: cycle.id,
          });
          const rows = statesBySchedule.get(key) ?? [];
          const stage = deriveScheduleStage({
            servingStates: rows.map((row) => row.state),
          });
          const lateMarkCount = lateMarksBySchedule.get(key) ?? 0;
          const openSwapRequestCount = swapCountBySchedule.get(key) ?? 0;
          const affectedVolunteerCount = await this.unitOfWork.run((tx) =>
            this.countScheduleChanges({
              churchId,
              ministryId: ministry.id,
              cycleId: cycle.id,
              tx,
            }),
          );
          if (stage !== 'asking')
            return {
              ministry,
              cycle,
              stage,
              lateMarkCount,
              openSwapRequestCount,
              affectedVolunteerCount,
            };
          const { confirmed = 0, asked = 0 } = countsBySchedule.get(key) ?? {};
          return {
            ministry,
            cycle,
            stage,
            lateMarkCount,
            openSwapRequestCount,
            affectedVolunteerCount,
            asking: { confirmed, asked },
          };
        }),
      ),
    );
  }

  private async getOrCreateParticipation(
    input: GetOrCreateParticipationInput,
  ): Promise<MinistryParticipation> {
    const existing = await this.participationRepository.findByMinistryEvent({
      churchId: input.churchId,
      ministryId: input.ministryId,
      eventId: input.eventId,
      tx: input.tx,
    });

    if (existing) {
      return existing;
    }

    // A new participation is new use: refused for an archived Ministry.
    await this.ministryRepository.lockActive({
      churchId: input.churchId,
      ministryId: input.ministryId,
      strength: 'share',
      tx: input.tx,
    });
    return this.participationRepository.create({
      churchId: input.churchId,
      ministryId: input.ministryId,
      eventId: input.eventId,
      tx: input.tx,
    });
  }

  private async resolveParticipationEventTimeBlock({
    churchId,
    participation,
    eventTimeBlockId,
    tx,
  }: ResolveParticipationEventTimeBlockInput): Promise<EventTimeBlock> {
    const eventTimeBlock = await this.eventTimeBlockRepository.getById({
      churchId,
      eventTimeBlockId,
      tx,
    });

    // Another Event's EventTimeBlock is as missing as an unknown one.
    if (eventTimeBlock.eventId !== participation.eventId) {
      throw new NotFoundError(`EventTimeBlock not found: ${eventTimeBlockId}`);
    }

    return eventTimeBlock;
  }

  private async getCompletionInternal({
    churchId,
    participationId,
    tx,
  }: GetParticipationCompletionInternalInput): Promise<ParticipationCompletionView> {
    const [requirements, assignments] = await Promise.all([
      this.shiftRepository.listRequirementsByParticipation({
        churchId,
        participationId,
        tx,
      }),
      this.assignmentRepository.listByParticipation({
        churchId,
        participationId,
        tx,
      }),
    ]);
    const peopleNeeded = requirements.reduce(
      (sum, requirement) => sum + requirement.peopleNeeded,
      0,
    );
    const assignedCount = assignments.filter((assignment) =>
      isActiveAssignmentStatus(assignment.status),
    ).length;
    const activeByRequirement = new Map<string, number>();
    for (const assignment of assignments) {
      if (
        assignment.shiftRequirementId &&
        isActiveAssignmentStatus(assignment.status)
      ) {
        const requirementId = assignment.shiftRequirementId as string;
        const activeCount = activeByRequirement.get(requirementId) ?? 0;
        activeByRequirement.set(requirementId, activeCount + 1);
      }
    }
    const coveredPlaces = requirements.reduce((sum, requirement) => {
      const activeCount =
        activeByRequirement.get(requirement.id as string) ?? 0;
      const coveredCount = Math.min(activeCount, requirement.peopleNeeded);
      return sum + coveredCount;
    }, 0);

    return {
      participationId,
      peopleNeeded,
      assignedCount,
      completionPercent: calculateCompletionPercent({
        assignedCount: coveredPlaces,
        peopleNeeded,
      }),
    };
  }

  /**
   * Membership facts per volunteer for one ministry, keyed by volunteer id:
   * qualified role ids and ministry-wide access level. Reads the
   * membership rows directly rather than inverting the per-role candidate
   * lists, so a volunteer's full skill set survives even when the cycle
   * happens to require only some of their roles.
   */
  private async listVolunteerMembershipInfo({
    churchId,
    ministryId,
    tx,
  }: ListVolunteerMembershipInfoInput): Promise<
    Map<string, VolunteerMembershipInfo>
  > {
    const memberships = await this.volunteerRepository.listMinistryMemberships({
      churchId,
      ministryId,
      tx,
    });
    return new Map(
      memberships.map((membership) => [
        membership.volunteerId as string,
        {
          qualifiedRoleIds: membership.qualifiedRoleIds,
          ministryAccessLevel: membership.ministryAccessLevel,
        },
      ]),
    );
  }

  private async listQualifiedVolunteersForShift({
    churchId,
    participation,
    requirements,
    tx,
  }: ListQualifiedVolunteersForShiftInput) {
    const volunteersById = new Map<
      string,
      Awaited<ReturnType<VolunteerRepository['listQualifiedForRole']>>[number]
    >();

    for (const requirement of requirements) {
      const volunteers = await this.volunteerRepository.listQualifiedForRole({
        churchId,
        ministryId: participation.ministryId,
        roleId: requirement.roleId,
        tx,
      });
      for (const volunteer of volunteers) {
        volunteersById.set(volunteer.id as string, volunteer);
      }
    }

    return [...volunteersById.values()];
  }

  private async loadCheckStates({
    churchId,
    ministryId,
    cycleId,
    tx,
  }: LoadCheckStatesInput) {
    const memberships =
      await this.availabilityCheckRepository.listActiveMemberships({
        churchId,
        ministryId,
        tx,
      });
    if (memberships.length === 0)
      return new Map<string, 'pending' | 'confirmed'>();
    const checks = await this.availabilityCheckRepository.listByCycle({
      churchId,
      cycleId,
      ministryMembershipIds: memberships.map((m) => m.ministryMembershipId),
      tx,
    });
    const volunteers = new Map(
      memberships.map((m) => [m.ministryMembershipId, m.volunteerId as string]),
    );
    const result = new Map<string, 'pending' | 'confirmed'>();
    for (const check of checks) {
      const volunteerId = volunteers.get(check.ministryMembershipId);
      if (volunteerId) result.set(volunteerId, check.state);
    }
    return result;
  }

  private async loadCandidateFacts({
    churchId,
    volunteerIds,
    tx,
  }: LoadCandidateFactsInput): Promise<CandidateFacts> {
    const [unavailableShifts, assignments] = await Promise.all([
      this.unavailableShiftRepository.listByVolunteers({
        churchId,
        volunteerIds,
        tx,
      }),
      this.assignmentRepository.listByVolunteers({
        churchId,
        volunteerIds,
        tx,
      }),
    ]);
    const activeAssignments = assignments.filter((assignment) =>
      isActiveAssignmentStatus(assignment.status),
    );
    const shiftIds = [
      ...new Set(
        activeAssignments
          .map((assignment) => assignment.shiftId)
          .filter((id): id is Shift['id'] => id != null),
      ),
    ];
    const facts = await this.shiftRepository.listConflictFacts({
      churchId,
      shiftIds,
      tx,
    });
    const assignmentShiftsById = new Map(
      facts.map(({ shift }) => [shift.id as string, shift]),
    );
    const conflictDetails: CandidateFacts['conflictDetails'] = new Map(
      facts.map(({ shift, ministryName, eventTitle }) => [
        shift.id as string,
        {
          ministryName,
          eventTitle,
          startTime: shift.startTime,
          endTime: shift.endTime,
        },
      ]),
    );
    const unavailableShiftKeys = new Set(
      unavailableShifts.map(
        (mark) => `${mark.volunteerId as string}:${mark.shiftId as string}`,
      ),
    );
    return {
      activeAssignments,
      assignmentShiftsById,
      conflictDetails,
      unavailableShiftKeys,
    };
  }

  private async listEligibleVolunteersForShifts({
    churchId,
    participation,
    shifts,
    requirements,
    membershipInfoByVolunteerId,
    checkStates,
    candidateFacts,
    tx,
  }: ListEligibleForShiftsInput): Promise<
    Map<string, EligibleVolunteerView[]>
  > {
    const eligibleByShift = new Map<string, EligibleVolunteerView[]>();
    if (shifts.length === 0) {
      return eligibleByShift;
    }

    const requirementsByShift = new Map<string, ShiftRequirement[]>();
    for (const requirement of requirements) {
      const key = (requirement.shiftId ?? '') as string;
      const shiftRequirements = requirementsByShift.get(key) ?? [];
      shiftRequirements.push(requirement);
      requirementsByShift.set(key, shiftRequirements);
    }

    // Qualified volunteers per distinct role, fetched once and reused across
    // every shift that requires that role (batched — never per-shift N+1).
    const volunteersByRole = new Map<string, QualifiedVolunteerRef[]>();
    for (const requirement of requirements) {
      const roleKey = requirement.roleId as string;
      if (volunteersByRole.has(roleKey)) {
        continue;
      }
      const volunteers = await this.volunteerRepository.listQualifiedForRole({
        churchId,
        ministryId: participation.ministryId,
        roleId: requirement.roleId,
        tx,
      });
      volunteersByRole.set(roleKey, volunteers);
    }

    const {
      activeAssignments,
      assignmentShiftsById,
      unavailableShiftKeys,
      conflictDetails,
    } = candidateFacts;
    for (const shift of shifts) {
      const shiftRequirements =
        requirementsByShift.get(shift.id as string) ?? [];
      const qualified: QualifiedVolunteerRef[] = dedupeVolunteersById(
        shiftRequirements.flatMap(
          (requirement) =>
            volunteersByRole.get(requirement.roleId as string) ?? [],
        ),
      );
      const eligible = qualified.map((volunteer) =>
        buildEligibleForVolunteer({
          volunteer,
          shift,
          activeAssignments,
          fairnessAssignments: activeAssignments,
          assignmentShiftsById,
          unavailableShiftKeys,
          membershipInfoByVolunteerId,
          checkStates,
          conflictDetails,
        }),
      );
      eligibleByShift.set(
        shift.id as string,
        sortEligibleVolunteers({ eligible, assignments: activeAssignments }),
      );
    }

    return eligibleByShift;
  }
}

function dedupeVolunteersById(
  volunteers: QualifiedVolunteerRef[],
): QualifiedVolunteerRef[] {
  const byId = new Map<string, QualifiedVolunteerRef>();
  for (const volunteer of volunteers) {
    byId.set(volunteer.id as string, volunteer);
  }
  return [...byId.values()];
}

function buildBuilderEventView({
  eventGroup,
  participation,
  includedEventTimeBlockIds,
  shifts,
  requirements,
  assignments,
  marks,
  eligibleByShift,
}: BuildBuilderEventViewInput): CycleBuilderEventView {
  const shiftsByEventTimeBlock = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const eventTimeBlockShifts =
      shiftsByEventTimeBlock.get(shift.eventTimeBlockId as string) ?? [];
    eventTimeBlockShifts.push(shift);
    shiftsByEventTimeBlock.set(
      shift.eventTimeBlockId as string,
      eventTimeBlockShifts,
    );
  }

  const requirementsByShift = new Map<string, CycleBuilderRequirementView[]>();
  for (const requirement of requirements) {
    const key = (requirement.shiftId ?? '') as string;
    const shiftRequirements = requirementsByShift.get(key) ?? [];
    shiftRequirements.push({
      requirement,
    });
    requirementsByShift.set(key, shiftRequirements);
  }

  const assignmentsByShift = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    if (assignment.shiftId == null) {
      continue;
    }
    const key = assignment.shiftId as string;
    const shiftAssignments = assignmentsByShift.get(key) ?? [];
    shiftAssignments.push(assignment);
    assignmentsByShift.set(key, shiftAssignments);
  }

  const eventTimeBlocks: CycleBuilderEventTimeBlockView[] =
    eventGroup.eventTimeBlocks.map((eventTimeBlock) => {
      const eventTimeBlockShifts =
        shiftsByEventTimeBlock.get(eventTimeBlock.id as string) ?? [];
      const shiftViews: CycleBuilderShiftView[] = eventTimeBlockShifts.map(
        (shift) => ({
          shift,
          requirements: requirementsByShift.get(shift.id as string) ?? [],
          assignments: (assignmentsByShift.get(shift.id as string) ?? []).map(
            (assignment) => ({
              assignment,
              lateMark: marks.some(
                (mark) =>
                  mark.shiftId === shift.id &&
                  mark.volunteerId === assignment.volunteerId &&
                  compareInstants({
                    left: fromDate({ date: mark.createdAt }),
                    right: assignment.assignedAt,
                  }) > 0,
              ),
            }),
          ),
          eligibleVolunteers: eligibleByShift.get(shift.id as string) ?? [],
        }),
      );

      return {
        eventTimeBlock,
        included: includedEventTimeBlockIds.has(eventTimeBlock.id as string),
        shifts: shiftViews,
      };
    });

  return {
    participation,
    event: eventGroup.event,
    eventTimeBlocks,
  };
}

function buildEligibleForVolunteer({
  volunteer,
  shift,
  activeAssignments,
  fairnessAssignments,
  assignmentShiftsById,
  unavailableShiftKeys,
  membershipInfoByVolunteerId,
  checkStates,
  conflictDetails,
}: BuildEligibleForVolunteerInput): EligibleVolunteerView {
  const volunteerAssignments = activeAssignments.filter(
    (assignment) => assignment.volunteerId === volunteer.id,
  );
  const overlapping = volunteerAssignments.find((assignment) => {
    const other = assignmentShiftsById.get(assignment.shiftId as string);
    return (
      assignment.shiftId !== shift.id &&
      other &&
      rangesOverlap({
        startTime: shift.startTime,
        endTime: shift.endTime,
        otherStartTime: other.startTime,
        otherEndTime: other.endTime,
      })
    );
  });
  const details =
    overlapping && conflictDetails.get(overlapping.shiftId as string);
  const conflict =
    overlapping && details
      ? { assignmentId: overlapping.id as string, ...details }
      : null;
  const isUnavailable = unavailableShiftKeys.has(
    `${volunteer.id as string}:${shift.id as string}`,
  );
  const checkState = checkStates.get(volunteer.id as string);
  const answerState =
    checkState === 'pending'
      ? 'unanswered'
      : !checkState
        ? 'not_asked'
        : isUnavailable
          ? 'unavailable'
          : 'available';
  const lastServedAt = fairnessAssignments
    .filter((assignment) => assignment.volunteerId === volunteer.id)
    .map(
      (assignment) =>
        assignmentShiftsById.get(assignment.shiftId as string)?.startTime,
    )
    .filter(
      (servedAt): servedAt is Instant =>
        servedAt !== undefined &&
        compareInstants({ left: servedAt, right: shift.startTime }) < 0,
    )
    .sort((left, right) => compareInstants({ left: right, right: left }))[0];

  const membershipInfo = membershipInfoByVolunteerId.get(
    volunteer.id as string,
  );

  return buildEligibleVolunteerView({
    volunteerId: volunteer.id as string,
    volunteerName: volunteer.name ?? 'Unknown volunteer',
    answerState,
    conflict,
    lastServedAt,
    qualifiedRoleIds: membershipInfo?.qualifiedRoleIds ?? [],
    ministryAccessLevel: membershipInfo?.ministryAccessLevel ?? 'volunteer',
  });
}

function toPublishCycleOutcome(
  candidate: PublishCandidate,
): PublishCycleParticipationOutcome {
  return {
    participationId: candidate.participation.id,
    state: candidate.participation.state,
    peopleNeeded: candidate.completion.peopleNeeded,
    assignedCount: candidate.completion.assignedCount,
  };
}

function sortEligibleVolunteers({
  eligible,
  assignments,
}: SortEligibleVolunteersInput): EligibleVolunteerView[] {
  const workload = new Map<string, number>();
  for (const assignment of assignments) {
    const id = assignment.volunteerId as string;
    workload.set(id, (workload.get(id) ?? 0) + 1);
  }
  return [...eligible].sort((left, right) => {
    const order = ['available', 'unanswered', 'not_asked', 'unavailable'];
    if (left.answerState !== right.answerState)
      return order.indexOf(left.answerState) - order.indexOf(right.answerState);

    if (left.lastServedAt !== right.lastServedAt) {
      if (!left.lastServedAt) return -1;
      if (!right.lastServedAt) return 1;
      const comparison = compareInstants({
        left: left.lastServedAt,
        right: right.lastServedAt,
      });
      if (comparison !== 0) return comparison;
    }

    const workloadDifference =
      (workload.get(left.volunteerId as string) ?? 0) -
      (workload.get(right.volunteerId as string) ?? 0);
    return (
      workloadDifference ||
      left.volunteerName.localeCompare(right.volunteerName)
    );
  });
}

/**
 * Every stage accepts edits, so a published Schedule can prepare an Event added
 * to its Sent Cycle; answered Shifts stay guarded and Send updates tells the rest.
 * Elapsed or unsent Cycles refuse.
 */
function ensurePreparationEditable({
  cycle,
  timeZone,
}: EnsurePreparationEditableInput): void {
  const to = 'save_preparation';
  const currentInstant = now();
  const churchToday = today({ instant: currentInstant, timeZone });
  // endDate is the Cycle's last day: edits stay open through it.
  if (compareCalendarDays({ left: churchToday, right: cycle.endDate }) > 0) {
    throw new IllegalStateTransitionError({ from: 'past', to });
  }
  if (cycle.state !== 'sent') {
    throw new IllegalStateTransitionError({ from: cycle.state, to });
  }
}

interface DiffShiftsInput {
  existingShifts: Shift[];
  desiredShifts: Shift[];
}

interface ShiftChange {
  /** The desired Shifts in order, an existing Shift wherever its span survives. */
  shifts: Shift[];
  added: Shift[];
  removed: Shift[];
}

function diffShifts({
  existingShifts,
  desiredShifts,
}: DiffShiftsInput): ShiftChange {
  const shifts = desiredShifts.map(
    (desired) =>
      existingShifts.find(
        (existing) =>
          compareInstants({
            left: existing.startTime,
            right: desired.startTime,
          }) === 0 &&
          compareInstants({
            left: existing.endTime,
            right: desired.endTime,
          }) === 0,
      ) ?? desired,
  );
  return {
    shifts,
    added: shifts.filter((shift) => !existingShifts.includes(shift)),
    removed: existingShifts.filter((shift) => !shifts.includes(shift)),
  };
}

interface ShiftResponses {
  markCountByShift: Map<string, number>;
  assignmentCountByShift: Map<string, number>;
  assignedCountByRequirement: Map<string, number>;
}

interface CountShiftResponsesInput {
  marks: UnavailableShift[];
  assignments: Assignment[];
}

function countShiftResponses({
  marks,
  assignments,
}: CountShiftResponsesInput): ShiftResponses {
  const activeAssignments = assignments.filter((assignment) =>
    isActiveAssignmentStatus(assignment.status),
  );
  return {
    markCountByShift: countBy({
      keys: marks.map((mark) => mark.shiftId as string),
    }),
    assignmentCountByShift: countBy({
      keys: activeAssignments.map((assignment) => assignment.shiftId as string),
    }),
    assignedCountByRequirement: countBy({
      keys: activeAssignments.map(
        (assignment) => assignment.shiftRequirementId as string,
      ),
    }),
  };
}

interface AssertNoShiftResponsesInput {
  shifts: Shift[];
  responses: ShiftResponses;
}

function assertNoShiftResponses({
  shifts,
  responses: { markCountByShift, assignmentCountByShift },
}: AssertNoShiftResponsesInput): void {
  const shiftResponses = shifts
    .map(({ id: shiftId }) => ({
      shiftId,
      unavailableMarkCount: markCountByShift.get(shiftId as string) ?? 0,
      assignmentCount: assignmentCountByShift.get(shiftId as string) ?? 0,
    }))
    .filter(
      ({ unavailableMarkCount, assignmentCount }) =>
        unavailableMarkCount > 0 || assignmentCount > 0,
    );
  if (shiftResponses.length > 0) {
    throw new ShiftHasResponsesError({ shiftResponses });
  }
}

interface AssertHeadcountFloorsInput {
  current: ShiftRequirement[];
  desired: DesiredRequirement[];
  responses: ShiftResponses;
}

function assertHeadcountFloors({
  current,
  desired,
  responses: { assignedCountByRequirement },
}: AssertHeadcountFloorsInput): void {
  const neededByPlace = new Map(
    desired.map((place) => [placeOf(place), place.peopleNeeded]),
  );
  const headcountFloors = current.flatMap((requirement) => {
    const { shiftId, sectorId, roleId } = requirement;
    const assignedCount =
      assignedCountByRequirement.get(requirement.id as string) ?? 0;
    const needed = neededByPlace.get(placeOf(requirement)) ?? 0;
    return shiftId && needed < assignedCount
      ? [{ shiftId, sectorId, roleId, assignedCount }]
      : [];
  });
  if (headcountFloors.length > 0) {
    throw new HeadcountBelowAssignedError({ headcountFloors });
  }
}

function placeOf({ shiftId, sectorId, roleId }: RequirementPlace): string {
  return `${shiftId}:${sectorId}:${roleId}`;
}

function buildEventView({
  eventGroup,
  participation,
  includedEventTimeBlockIds,
  shifts,
  requirements,
  marks,
  assignments,
  availabilityRequestedAt,
}: BuildEventViewInput): ParticipationEventView {
  const {
    markCountByShift,
    assignmentCountByShift,
    assignedCountByRequirement,
  } = countShiftResponses({ marks, assignments });

  const shiftsByEventTimeBlock = groupBy({
    items: shifts,
    keyOf: (shift) => shift.eventTimeBlockId as string,
  });
  const requirementsByShift = groupBy({
    items: requirements,
    keyOf: (requirement) => (requirement.shiftId ?? '') as string,
  });

  const eventTimeBlocks: ParticipationEventTimeBlockView[] =
    eventGroup.eventTimeBlocks.map((eventTimeBlock) => {
      const eventTimeBlockShifts =
        shiftsByEventTimeBlock.get(eventTimeBlock.id as string) ?? [];
      const shiftViews: ParticipationShiftView[] = eventTimeBlockShifts.map(
        (shift) => {
          const shiftRequirements = (
            requirementsByShift.get(shift.id as string) ?? []
          ).map((requirement) => ({
            requirement,
            assignedCount:
              assignedCountByRequirement.get(requirement.id as string) ?? 0,
          }));

          return {
            shift,
            requirements: shiftRequirements,
            unavailableMarkCount: markCountByShift.get(shift.id as string) ?? 0,
            assignmentCount:
              assignmentCountByShift.get(shift.id as string) ?? 0,
            flagged: shiftRequirements.length === 0,
          };
        },
      );

      return {
        eventTimeBlock,
        included: includedEventTimeBlockIds.has(eventTimeBlock.id as string),
        shifts: shiftViews,
        requirements: shiftViews.flatMap((view) => view.requirements),
        shiftsChangedAfterAsk:
          availabilityRequestedAt !== null &&
          eventTimeBlockShifts.some(
            (shift) => shift.createdAt > availabilityRequestedAt,
          ),
      };
    });

  return {
    participation,
    event: eventGroup.event,
    generatedFromTemplate: eventGroup.event.sourceTemplateId !== undefined,
    eventTimeBlocks,
  };
}

interface CountByInput {
  keys: string[];
}

function countBy({ keys }: CountByInput): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

interface GroupByInput<Item> {
  items: Item[];
  keyOf: (item: Item) => string;
}

function groupBy<Item>({
  items,
  keyOf,
}: GroupByInput<Item>): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

interface RangesOverlapInput {
  startTime: Instant;
  endTime: Instant;
  otherStartTime: Instant;
  otherEndTime: Instant;
}

function rangesOverlap({
  startTime,
  endTime,
  otherStartTime,
  otherEndTime,
}: RangesOverlapInput): boolean {
  return (
    compareInstants({ left: startTime, right: otherEndTime }) < 0 &&
    compareInstants({ left: endTime, right: otherStartTime }) > 0
  );
}

function isActiveAssignmentStatus(status: string): boolean {
  return status === 'draft' || status === 'pending' || status === 'confirmed';
}

function buildEligibleVolunteerView({
  volunteerId,
  volunteerName,
  answerState,
  conflict,
  lastServedAt,
  qualifiedRoleIds,
  ministryAccessLevel,
}: BuildEligibleVolunteerViewInput): EligibleVolunteerView {
  return {
    volunteerId: volunteerId as EligibleVolunteerView['volunteerId'],
    volunteerName,
    answerState,
    conflict,
    lastServedAt,
    qualifiedRoleIds,
    ministryAccessLevel,
  };
}

interface ToUsualSetupBlockViewInput {
  template: EventTemplate;
  block: TemplateTimeBlock;
  entry: UsualSetup | undefined;
}

function toUsualSetupBlockView({
  template,
  block,
  entry,
}: ToUsualSetupBlockViewInput): UsualSetupBlockView {
  return {
    templateId: template.id,
    templateName: template.name,
    weekday: template.weekday,
    sourceTemplateTimeBlockId: block.id,
    label: block.label,
    startTime: block.startTime,
    endTime: block.endTime,
    order: block.order,
    entry,
    // Derived on every read from the serving manual split vs current bounds.
    needsReview:
      entry?.serves === true &&
      entry.shiftSplit.kind === 'manual' &&
      !splitFitsBlock({
        shiftSplit: entry.shiftSplit,
        ...wallClockUtcBounds(block),
      }),
  };
}
