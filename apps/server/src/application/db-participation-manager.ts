import { NotFoundError } from '@church/core';
import {
  compareCalendarDays,
  compareInstants,
  fromDate,
  type Instant,
  now,
  toDate,
  today,
} from '@church/time';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  SectorId,
} from '../domain/branded-ids';
import type { ConflictIssue } from '../domain/conflict/types';
import type { IChurchNotifications } from '../domain/contracts/application/church-notifications';
import type {
  CycleBuilderEventTimeBlockView,
  CycleBuilderEventView,
  CycleBuilderRequirementView,
  CycleBuilderRoleOption,
  CycleBuilderShiftView,
  CycleBuilderView,
  CycleParticipationView,
  DeleteShiftManagerInput,
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
  SetInclusionsInput,
  SplitShiftsManagerInput,
  UpdateShiftManagerInput,
  UpsertRequirementManagerInput,
  UsualSetupBlockView,
} from '../domain/contracts/application/participation-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { EventTemplateRepository } from '../domain/contracts/infrastructure/event-template.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { SectorRepository } from '../domain/contracts/infrastructure/sector.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
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
import { Shift } from '../domain/entities/shift';
import type { ShiftRequirement } from '../domain/entities/shift-requirement';
import type { TemplateTimeBlock } from '../domain/entities/template-time-block';
import type { UnavailableShift } from '../domain/entities/unavailable-shift';
import {
  assertManualSplitFitsBlock,
  assertValidHeadcounts,
  assertValidUsualSetupProps,
  toSaveableUsualSetupEntry,
  type UsualSetup,
  type UsualSetupHeadcount,
} from '../domain/entities/usual-setup';
import {
  IllegalStateTransitionError,
  InvalidRequiredCountError,
} from '../domain/errors';
import { InvalidShiftIndexError } from '../domain/errors/invalid-shift-index';
import { InvalidShiftSplitError } from '../domain/errors/invalid-shift-split';
import { PreparationEmptyError } from '../domain/errors/preparation-empty';
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

interface GetOrCreateParticipationInput extends GetCycleParticipationInput {
  eventId: EventWithEventTimeBlocks['event']['id'];
  tx: TransactionContext;
}

interface EnsurePrepareInput {
  participation: MinistryParticipation;
  action: string;
}

interface EnsurePreparationEditableInput {
  participation: MinistryParticipation;
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

interface ApplyPreparationGraphInput extends PreparationTarget {
  existingShifts: Shift[];
  shiftSplit?: ShiftSplitStrategy;
  headcounts: UsualSetupHeadcount[];
}

interface KeepOrReplaceShiftsInput extends PreparationTarget {
  existingShifts: Shift[];
  desiredShifts: Shift[];
}

interface ReconcileRequirementsInput extends PreparationTarget {
  shifts: Shift[];
  headcounts: UsualSetupHeadcount[];
}

interface RequirementPlace {
  shiftId: Shift['id'] | undefined;
  sectorId: SectorId;
  roleId: RoleId;
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
  eventTimeBlockId: SetInclusionsInput['eventTimeBlockIds'][number];
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
  isUnavailable: boolean;
  activeAssignmentWarnings: ConflictIssue[];
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
}

interface ListVolunteerMembershipInfoInput {
  churchId: ChurchId;
  ministryId: MinistryParticipation['ministryId'];
  tx?: TransactionContext;
}

interface ListEligibleForShiftsInput {
  churchId: ChurchId;
  participation: MinistryParticipation;
  shifts: Shift[];
  requirements: ShiftRequirement[];
  membershipInfoByVolunteerId: Map<string, VolunteerMembershipInfo>;
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
  eligibleByShift: Map<string, EligibleVolunteerView[]>;
}

interface PublishCandidate {
  participation: MinistryParticipation;
  completion: ParticipationCompletionView;
}

interface NotifyParticipationPublishedInput {
  churchId: ChurchId;
  participation: MinistryParticipation;
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
  private readonly staffingSeeder: UsualSetupStaffingSeeder;
  private readonly notifications: IChurchNotifications;
  private readonly unitOfWork: UnitOfWork;

  constructor({
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
    staffingSeeder,
    notifications,
    unitOfWork,
  }: DbParticipationManagerDependencies) {
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
    await this.ministryRepository.getById({
      churchId: input.churchId,
      id: input.ministryId,
    });
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

      const events: CycleBuilderEventView[] = [];

      for (const eventGroup of eventGroups) {
        const participation = await this.getOrCreateParticipation({
          churchId: input.churchId,
          cycleId: input.cycleId,
          ministryId: input.ministryId,
          eventId: eventGroup.event.id,
          tx,
        });
        const [inclusions, shifts, requirements, assignments] =
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
            eligibleByShift,
          }),
        );
      }

      const roleOptions: CycleBuilderRoleOption[] = roles.map((role) => ({
        id: role.id,
        name: role.name,
      }));

      return { events, roles: roleOptions };
    });
  }

  async setInclusions(input: SetInclusionsInput): Promise<void> {
    await this.unitOfWork.run(async (tx) => {
      const participation = await this.participationRepository.getById({
        churchId: input.churchId,
        participationId: input.participationId,
        tx,
      });
      ensurePrepare({ participation, action: 'set_inclusions' });

      const previousInclusions =
        await this.participationRepository.listInclusions({
          churchId: input.churchId,
          participationId: input.participationId,
          tx,
        });
      const nextEventTimeBlockIds = new Set(
        input.eventTimeBlockIds as string[],
      );
      const removedEventTimeBlockIds = previousInclusions
        .map((inclusion) => inclusion.eventTimeBlockId)
        .filter(
          (eventTimeBlockId) =>
            !nextEventTimeBlockIds.has(eventTimeBlockId as string),
        );

      await this.participationRepository.replaceInclusions({
        churchId: input.churchId,
        participationId: input.participationId,
        eventTimeBlockIds: input.eventTimeBlockIds,
        tx,
      });

      for (const eventTimeBlockId of removedEventTimeBlockIds) {
        await this.shiftRepository.deleteByEventTimeBlock({
          churchId: input.churchId,
          participationId: input.participationId,
          eventTimeBlockId,
          tx,
        });
      }

      for (const eventTimeBlockId of input.eventTimeBlockIds) {
        const eventTimeBlock = await this.resolveParticipationEventTimeBlock({
          churchId: input.churchId,
          participation,
          eventTimeBlockId,
          tx,
        });
        const existingShifts = await this.shiftRepository.listByEventTimeBlock({
          churchId: input.churchId,
          participationId: input.participationId,
          eventTimeBlockId,
          tx,
        });

        if (existingShifts.length === 0) {
          await this.shiftRepository.createMany({
            churchId: input.churchId,
            shifts: [
              new Shift({
                props: {
                  churchId: input.churchId,
                  participationId: input.participationId,
                  eventTimeBlockId,
                  startTime: eventTimeBlock.startTime,
                  endTime: eventTimeBlock.endTime,
                },
                eventTimeBlockBounds: {
                  startTime: eventTimeBlock.startTime,
                  endTime: eventTimeBlock.endTime,
                },
              }),
            ],
            tx,
          });
        }
      }

      participation.touch();
      await this.participationRepository.touch({
        churchId: input.churchId,
        participationId: input.participationId,
        tx,
      });
    });
  }

  async splitShifts(input: SplitShiftsManagerInput): Promise<Shift[]> {
    return this.unitOfWork.run(async (tx) => {
      const participation = await this.participationRepository.getById({
        churchId: input.churchId,
        participationId: input.participationId,
        tx,
      });
      ensurePrepare({ participation, action: 'split_shifts' });

      const eventTimeBlock = await this.resolveParticipationEventTimeBlock({
        churchId: input.churchId,
        participation,
        eventTimeBlockId: input.eventTimeBlockId,
        tx,
      });

      const shifts = this.splitter.split({
        churchId: input.churchId,
        participationId: input.participationId,
        eventTimeBlock: {
          id: eventTimeBlock.id,
          startTime: eventTimeBlock.startTime,
          endTime: eventTimeBlock.endTime,
        },
        strategy: input.strategy,
      });

      await this.shiftRepository.deleteByEventTimeBlock({
        churchId: input.churchId,
        participationId: input.participationId,
        eventTimeBlockId: input.eventTimeBlockId,
        tx,
      });
      const created = await this.shiftRepository.createMany({
        churchId: input.churchId,
        shifts,
        tx,
      });
      await this.participationRepository.addInclusion({
        churchId: input.churchId,
        participationId: input.participationId,
        eventTimeBlockId: input.eventTimeBlockId,
        tx,
      });

      participation.touch();
      await this.participationRepository.touch({
        churchId: input.churchId,
        participationId: input.participationId,
        tx,
      });

      return created;
    });
  }

  async updateShift(input: UpdateShiftManagerInput): Promise<Shift> {
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
      ensurePrepare({ participation, action: 'update_shift' });

      const eventTimeBlock = await this.eventTimeBlockRepository.getById({
        churchId: input.churchId,
        eventTimeBlockId: shift.eventTimeBlockId,
        tx,
      });

      shift.updateBounds({
        startTime: input.startTime
          ? fromDate({ date: input.startTime })
          : shift.startTime,
        endTime: input.endTime
          ? fromDate({ date: input.endTime })
          : shift.endTime,
        eventTimeBlockBounds: {
          startTime: eventTimeBlock.startTime,
          endTime: eventTimeBlock.endTime,
        },
      });

      return this.shiftRepository.update({
        churchId: input.churchId,
        shiftId: input.shiftId,
        startTime: toDate({ instant: shift.startTime }),
        endTime: toDate({ instant: shift.endTime }),
        ...(input.label !== undefined ? { label: input.label } : {}),
        tx,
      });
    });
  }

  async deleteShift(input: DeleteShiftManagerInput): Promise<void> {
    await this.unitOfWork.run(async (tx) => {
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
      ensurePrepare({ participation, action: 'delete_shift' });

      await this.shiftRepository.deleteById({
        churchId: input.churchId,
        shiftId: input.shiftId,
        tx,
      });
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

  async upsertRequirement(
    input: UpsertRequirementManagerInput,
  ): Promise<ShiftRequirement> {
    if (input.peopleNeeded < 1) {
      throw new InvalidRequiredCountError();
    }

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
      ensurePrepare({ participation, action: 'upsert_requirement' });
      await this.assertMinistryHeadcounts({
        churchId: input.churchId,
        ministryId: participation.ministryId,
        headcounts: [{ sectorId: input.sectorId, roleId: input.roleId }],
        tx,
      });

      const requirement = await this.shiftRepository.upsertRequirement({
        churchId: input.churchId,
        shiftId: input.shiftId,
        participationId: shift.participationId,
        sectorId: input.sectorId,
        roleId: input.roleId,
        peopleNeeded: input.peopleNeeded,
        notes: input.notes,
        tx,
      });

      participation.touch();
      await this.participationRepository.touch({
        churchId: input.churchId,
        participationId: participation.id,
        tx,
      });

      return requirement;
    });
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
      ensurePreparationEditable({ participation, cycle, timeZone });

      const target = { churchId, participation, eventTimeBlock, tx };
      const existingShifts = await this.shiftRepository.listByEventTimeBlock({
        churchId,
        participationId,
        eventTimeBlockId,
        tx,
      });

      if (!serves) {
        await this.discardPreparation(target);
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
    tx,
  }: PreparationTarget): Promise<void> {
    const block = {
      churchId,
      participationId: participation.id,
      eventTimeBlockId: eventTimeBlock.id,
      tx,
    };
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
    await this.shiftRepository.createMany({
      churchId,
      shifts: this.splitter.split({
        churchId,
        participationId: participation.id,
        eventTimeBlock,
        strategy: { kind: 'equal-n', n: 1 },
      }),
      tx,
    });
  }

  /** Validates the submitted graph completely, then writes it over the block. */
  private async applyPreparationGraph({
    existingShifts,
    shiftSplit,
    headcounts,
    ...target
  }: ApplyPreparationGraphInput): Promise<void> {
    const { churchId, participation, eventTimeBlock, tx } = target;
    const positive = headcounts.filter(({ peopleNeeded }) => peopleNeeded > 0);
    if (!shiftSplit || positive.length === 0) {
      throw new PreparationEmptyError();
    }
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
    await this.assertMinistryHeadcounts({
      churchId,
      ministryId: participation.ministryId,
      headcounts: positive,
      tx,
    });

    const shifts = await this.keepOrReplaceShifts({
      ...target,
      existingShifts,
      desiredShifts,
    });
    await this.participationRepository.addInclusion({
      churchId,
      participationId: participation.id,
      eventTimeBlockId: eventTimeBlock.id,
      tx,
    });
    await this.reconcileRequirements({
      ...target,
      shifts,
      headcounts: positive,
    });
  }

  /** The same spans keep their Shifts, so answers and Assignments stay attached. */
  private async keepOrReplaceShifts({
    churchId,
    participation,
    eventTimeBlock,
    existingShifts,
    desiredShifts,
    tx,
  }: KeepOrReplaceShiftsInput): Promise<Shift[]> {
    if (sameSpans({ existingShifts, desiredShifts })) {
      for (const [index, existing] of existingShifts.entries()) {
        const label = desiredShifts[index]?.label;
        if (existing.label === label) continue;
        await this.shiftRepository.update({
          churchId,
          shiftId: existing.id,
          label: label ?? null,
          tx,
        });
      }
      return existingShifts;
    }

    await this.shiftRepository.deleteByEventTimeBlock({
      churchId,
      participationId: participation.id,
      eventTimeBlockId: eventTimeBlock.id,
      tx,
    });
    await this.shiftRepository.createMany({
      churchId,
      shifts: desiredShifts,
      tx,
    });
    return desiredShifts;
  }

  /** Omission removes a requirement; a kept pair keeps its id and notes. */
  private async reconcileRequirements({
    churchId,
    participation,
    shifts,
    headcounts,
    tx,
  }: ReconcileRequirementsInput): Promise<void> {
    const participationId = participation.id;
    const placeOf = ({ shiftId, sectorId, roleId }: RequirementPlace) =>
      `${shiftId}:${sectorId}:${roleId}`;
    const desired = headcounts.flatMap(({ shiftIndex, ...headcount }) => {
      const shift = shifts[shiftIndex];
      return shift ? [{ ...headcount, shiftId: shift.id }] : [];
    });
    const desiredPlaces = new Set(desired.map(placeOf));
    const shiftIds = new Set<string | undefined>(
      shifts.map((shift) => shift.id),
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
      await this.shiftRepository.upsertRequirement({
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
      const qualifiedVolunteers =
        shiftRequirements.length === 0
          ? await this.volunteerRepository.listByMinistry({
              churchId: input.churchId,
              ministryId: participation.ministryId,
              tx,
            })
          : await this.listQualifiedVolunteersForShift({
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
      const volunteerIds = qualifiedVolunteers.map((volunteer) => volunteer.id);
      const [unavailableShifts, assignments] = await Promise.all([
        this.unavailableShiftRepository.listByVolunteers({
          churchId: input.churchId,
          volunteerIds,
          tx,
        }),
        this.assignmentRepository.listByVolunteers({
          churchId: input.churchId,
          volunteerIds,
          tx,
        }),
      ]);
      const activeAssignments = assignments.filter((assignment) =>
        isActiveAssignmentStatus(assignment.status),
      );
      const assignmentShiftIds = [
        ...new Set(
          activeAssignments
            .map((assignment) => assignment.shiftId)
            .filter((shiftId): shiftId is Shift['id'] => shiftId != null),
        ),
      ];
      const assignmentShifts = await Promise.all(
        assignmentShiftIds.map((shiftId) =>
          this.shiftRepository.getById({
            churchId: input.churchId,
            shiftId,
            tx,
          }),
        ),
      );
      const assignmentShiftsById = new Map(
        assignmentShifts.map((assignmentShift) => [
          assignmentShift.id as string,
          assignmentShift,
        ]),
      );
      const unavailableShiftKeys = new Set(
        unavailableShifts.map(
          (unavailableShift) =>
            `${unavailableShift.volunteerId as string}:${unavailableShift.shiftId as string}`,
        ),
      );

      const eligible = qualifiedVolunteers.map((volunteer) =>
        buildEligibleForVolunteer({
          volunteer,
          shift,
          activeAssignments,
          fairnessAssignments: activeAssignments,
          assignmentShiftsById,
          unavailableShiftKeys,
          membershipInfoByVolunteerId,
        }),
      );

      return sortEligibleVolunteers(eligible);
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

      // Only availability-requested / assign participations are publishable;
      // prepare ones are not yet assigned and already-published ones are
      // reported unchanged.
      const publishable: PublishCandidate[] = [];
      const alreadyPublished: PublishCandidate[] = [];

      for (const eventGroup of eventGroups) {
        const participation = await this.getOrCreateParticipation({
          churchId: input.churchId,
          cycleId: input.cycleId,
          ministryId: input.ministryId,
          eventId: eventGroup.event.id,
          tx,
        });
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
        await this.notifyParticipationPublished({
          churchId: input.churchId,
          participation,
          tx,
        });
      }

      return {
        published: true,
        belowFull: anyBelowFull,
        participations: [...publishable, ...alreadyPublished].map(
          toPublishCycleOutcome,
        ),
      };
    });
  }

  private async notifyParticipationPublished({
    churchId,
    participation,
    tx,
  }: NotifyParticipationPublishedInput): Promise<void> {
    const assignments = await this.assignmentRepository.listByParticipation({
      churchId,
      participationId: participation.id,
      tx,
    });
    const volunteerIds = [
      ...new Set(
        assignments
          .filter((assignment) => isActiveAssignmentStatus(assignment.status))
          .map((assignment) => assignment.volunteerId),
      ),
    ];
    const volunteers = await this.volunteerRepository.listByIds({
      churchId,
      ids: volunteerIds,
      tx,
    });

    await this.notifications.enqueue({
      tx,
      kind: 'schedule_published',
      to: volunteers.map((volunteer) => ({
        userId: volunteer.userId,
        churchId,
      })),
      data: { participationId: participation.id as string },
    });
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
    const [servingStates, checkCounts] = await Promise.all([
      this.participationRepository.listScheduleServingStates(scope),
      this.participationRepository.countScheduleChecks(scope),
    ]);

    const statesBySchedule = Map.groupBy(servingStates, scheduleKey);
    const countsBySchedule = new Map(
      checkCounts.map((row) => [scheduleKey(row), row]),
    );

    return sentCycles.flatMap((cycle) =>
      ministries.map((ministry) => {
        const key = scheduleKey({
          ministryId: ministry.id,
          cycleId: cycle.id,
        });
        const rows = statesBySchedule.get(key) ?? [];
        const stage = deriveScheduleStage({
          servingStates: rows.map((row) => row.state),
        });
        if (stage !== 'asking') return { ministry, cycle, stage };
        const { confirmed = 0, asked = 0 } = countsBySchedule.get(key) ?? {};
        return { ministry, cycle, stage, asking: { confirmed, asked } };
      }),
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

  private async listEligibleVolunteersForShifts({
    churchId,
    participation,
    shifts,
    requirements,
    membershipInfoByVolunteerId,
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

    // A shift with no requirements falls back to the whole ministry.
    const needsMinistryWide = shifts.some(
      (shift) =>
        (requirementsByShift.get(shift.id as string) ?? []).length === 0,
    );
    const volunteersInMinistry = needsMinistryWide
      ? await this.volunteerRepository.listByMinistry({
          churchId,
          ministryId: participation.ministryId,
          tx,
        })
      : [];

    // Union of everyone who could appear so unavailable shifts/assignments load once.
    const volunteersById = new Map<string, QualifiedVolunteerRef>();
    for (const volunteers of volunteersByRole.values()) {
      for (const volunteer of volunteers) {
        volunteersById.set(volunteer.id as string, volunteer);
      }
    }
    for (const volunteer of volunteersInMinistry) {
      volunteersById.set(volunteer.id as string, volunteer);
    }
    const volunteerIds = [...volunteersById.values()].map(
      (volunteer) => volunteer.id,
    );

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
    const assignmentShiftIds = [
      ...new Set(
        activeAssignments
          .map((assignment) => assignment.shiftId)
          .filter((shiftId): shiftId is Shift['id'] => shiftId != null),
      ),
    ];
    const assignmentShifts = await Promise.all(
      assignmentShiftIds.map((shiftId) =>
        this.shiftRepository.getById({ churchId, shiftId, tx }),
      ),
    );
    const assignmentShiftsById = new Map(
      assignmentShifts.map((assignmentShift) => [
        assignmentShift.id as string,
        assignmentShift,
      ]),
    );
    const unavailableShiftKeys = new Set(
      unavailableShifts.map(
        (unavailableShift) =>
          `${unavailableShift.volunteerId as string}:${unavailableShift.shiftId as string}`,
      ),
    );

    for (const shift of shifts) {
      const shiftRequirements =
        requirementsByShift.get(shift.id as string) ?? [];
      const qualified: QualifiedVolunteerRef[] =
        shiftRequirements.length === 0
          ? volunteersInMinistry
          : dedupeVolunteersById(
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
        }),
      );
      eligibleByShift.set(shift.id as string, sortEligibleVolunteers(eligible));
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
          assignments: assignmentsByShift.get(shift.id as string) ?? [],
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
}: BuildEligibleForVolunteerInput): EligibleVolunteerView {
  const volunteerAssignments = activeAssignments.filter(
    (assignment) => assignment.volunteerId === volunteer.id,
  );
  const warnings = volunteerAssignments
    .filter((assignment) => assignment.shiftId !== shift.id)
    .flatMap((assignment) => {
      const assignmentShift = assignmentShiftsById.get(
        assignment.shiftId as string,
      );
      if (
        !assignmentShift ||
        !rangesOverlap({
          startTime: shift.startTime,
          endTime: shift.endTime,
          otherStartTime: assignmentShift.startTime,
          otherEndTime: assignmentShift.endTime,
        })
      ) {
        return [];
      }

      return [
        buildDoubleBookedWarning({ assignmentId: assignment.id as string }),
      ];
    });
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
    isUnavailable: unavailableShiftKeys.has(
      `${volunteer.id as string}:${shift.id as string}`,
    ),
    activeAssignmentWarnings: warnings,
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

function sortEligibleVolunteers(
  eligible: EligibleVolunteerView[],
): EligibleVolunteerView[] {
  return [...eligible].sort((left, right) => {
    if (left.isAvailable !== right.isAvailable) {
      return left.isAvailable ? -1 : 1;
    }

    if (left.lastServedAt !== right.lastServedAt) {
      if (!left.lastServedAt) return -1;
      if (!right.lastServedAt) return 1;
      const comparison = compareInstants({
        left: left.lastServedAt,
        right: right.lastServedAt,
      });
      if (comparison !== 0) return comparison;
    }

    return left.volunteerName.localeCompare(right.volunteerName);
  });
}

function ensurePrepare({ participation, action }: EnsurePrepareInput): void {
  if (participation.state !== 'preparing') {
    throw new IllegalStateTransitionError({
      from: participation.state,
      to: action,
    });
  }
}

/** Preparing through assigning accept edits; published and elapsed or unsent Cycles refuse. */
function ensurePreparationEditable({
  participation,
  cycle,
  timeZone,
}: EnsurePreparationEditableInput): void {
  const to = 'save_preparation';
  if (participation.state === 'published') {
    throw new IllegalStateTransitionError({ from: participation.state, to });
  }
  const churchToday = today({ instant: now(), timeZone });
  // endDate is the Cycle's last day: edits stay open through it.
  if (compareCalendarDays({ left: churchToday, right: cycle.endDate }) > 0) {
    throw new IllegalStateTransitionError({ from: 'past', to });
  }
  if (cycle.state !== 'sent') {
    throw new IllegalStateTransitionError({ from: cycle.state, to });
  }
}

interface SameSpansInput {
  existingShifts: Shift[];
  desiredShifts: Shift[];
}

function sameSpans({ existingShifts, desiredShifts }: SameSpansInput): boolean {
  return (
    existingShifts.length === desiredShifts.length &&
    existingShifts.every((existing, index) => {
      const desired = desiredShifts[index];
      return (
        desired !== undefined &&
        compareInstants({
          left: existing.startTime,
          right: desired.startTime,
        }) === 0 &&
        compareInstants({ left: existing.endTime, right: desired.endTime }) ===
          0
      );
    })
  );
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
  const markCountByShift = countBy({
    keys: marks.map((mark) => mark.shiftId as string),
  });
  const activeAssignments = assignments.filter((assignment) =>
    isActiveAssignmentStatus(assignment.status),
  );
  const assignedCountByRequirement = countBy({
    keys: activeAssignments.map(
      (assignment) => assignment.shiftRequirementId as string,
    ),
  });
  const assignmentCountByShift = countBy({
    keys: activeAssignments.map((assignment) => assignment.shiftId as string),
  });

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

interface BuildDoubleBookedWarningInput {
  assignmentId: string;
}

function buildDoubleBookedWarning({
  assignmentId,
}: BuildDoubleBookedWarningInput): ConflictIssue {
  return {
    type: 'DOUBLE_BOOKED',
    details: 'Volunteer is already assigned to another overlapping shift',
    conflictingId: assignmentId,
  };
}

function buildEligibleVolunteerView({
  volunteerId,
  volunteerName,
  isUnavailable,
  activeAssignmentWarnings,
  lastServedAt,
  qualifiedRoleIds,
  ministryAccessLevel,
}: BuildEligibleVolunteerViewInput): EligibleVolunteerView {
  return {
    volunteerId: volunteerId as EligibleVolunteerView['volunteerId'],
    volunteerName,
    isAvailable: !isUnavailable,
    hasConflict: activeAssignmentWarnings.length > 0,
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
