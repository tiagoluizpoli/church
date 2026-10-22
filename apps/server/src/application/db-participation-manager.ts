import { NotFoundError } from '@church/core';
import { compareInstants, fromDate, type Instant, toDate } from '@church/time';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  SectorId,
} from '../domain/branded-ids';
import type { ConflictIssue } from '../domain/conflict/types';
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
  GetUsualSetupInput,
  IParticipationManager,
  ListEligibleVolunteersInput,
  ListScheduleSummariesInput,
  ParticipationCompletionView,
  ParticipationEventTimeBlockView,
  ParticipationEventView,
  PublishCycleInput,
  PublishCycleParticipationOutcome,
  PublishCycleView,
  ScheduleSummaryView,
  SetInclusionsInput,
  SplitShiftsManagerInput,
  UpdateShiftManagerInput,
  UpsertRequirementManagerInput,
  UpsertUsualSetupInput,
} from '../domain/contracts/application/participation-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { EventTemplateRepository } from '../domain/contracts/infrastructure/event-template.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { NotificationService } from '../domain/contracts/infrastructure/notification-service';
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
import type { EventWithEventTimeBlocks } from '../domain/entities/event';
import type { EventTimeBlock } from '../domain/entities/event-time-block';
import type { MinistryAccessLevel } from '../domain/entities/ministry-membership';
import {
  calculateCompletionPercent,
  type MinistryParticipation,
} from '../domain/entities/ministry-participation';
import { Shift } from '../domain/entities/shift';
import type { ShiftRequirement } from '../domain/entities/shift-requirement';
import { UsualSetup } from '../domain/entities/usual-setup';
import {
  IllegalStateTransitionError,
  InvalidRequiredCountError,
} from '../domain/errors';
import { ShiftSplitter } from '../domain/services/shift-splitter';

interface EnsurePrepareInput {
  participation: MinistryParticipation;
  action: string;
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
  tx?: TransactionContext;
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
  notificationService: NotificationService;
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
  tx?: TransactionContext;
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
  private readonly notificationService: NotificationService;
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
    notificationService,
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
    this.notificationService = notificationService;
    this.unitOfWork = unitOfWork;
  }

  async getCycleParticipation(
    input: GetCycleParticipationInput,
  ): Promise<CycleParticipationView> {
    await this.ministryRepository.getById(input.churchId, input.ministryId);
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
      const events: ParticipationEventView[] = [];

      for (const eventGroup of eventGroups) {
        const participation = await this.getOrCreateParticipation({
          ...input,
          eventId: eventGroup.event.id,
          tx,
        });
        const [inclusions, shifts, requirements] = await Promise.all([
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
        ]);

        events.push(
          buildEventView({
            eventGroup,
            participation,
            includedEventTimeBlockIds: new Set(
              inclusions.map(
                (inclusion) => inclusion.eventTimeBlockId as string,
              ),
            ),
            shifts,
            requirements,
          }),
        );
      }

      return { events };
    });
  }

  async getCycleBuilderData(
    input: GetCycleBuilderDataInput,
  ): Promise<CycleBuilderView> {
    await this.ministryRepository.getById(input.churchId, input.ministryId);
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
      const roles = await this.roleRepository.listByMinistry(
        input.churchId,
        input.ministryId,
        tx,
      );
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
            this.assignmentRepository.listByParticipation(
              input.churchId,
              participation.id,
              tx,
            ),
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

      const eventTimeBlock = await this.eventTimeBlockRepository.getById(
        input.churchId,
        shift.eventTimeBlockId,
        tx,
      );

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

  /** A Sector or Role outside the Ministry (or Church) is not found (#385). */
  private async assertMinistryHeadcounts({
    churchId,
    ministryId,
    headcounts,
    tx,
  }: AssertMinistryHeadcountsInput): Promise<void> {
    if (headcounts.length === 0) return;
    const [sectors, roles] = await Promise.all([
      this.sectorRepository.listByMinistry({ churchId, ministryId, tx }),
      this.roleRepository.listByMinistry(churchId, ministryId, tx),
    ]);
    const sectorIds = new Set<string>(sectors.map((sector) => sector.id));
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

  async getUsualSetup(input: GetUsualSetupInput): Promise<UsualSetup[]> {
    await this.ministryRepository.getById(input.churchId, input.ministryId);
    return this.usualSetupRepository.listByMinistry(input);
  }

  async upsertUsualSetup(input: UpsertUsualSetupInput): Promise<UsualSetup[]> {
    await this.ministryRepository.getById(input.churchId, input.ministryId);
    // Validate every entry through the domain entity before persisting.
    for (const entry of input.entries) {
      void new UsualSetup({
        props: {
          churchId: input.churchId,
          ministryId: input.ministryId,
          sourceTemplateTimeBlockId: entry.sourceTemplateTimeBlockId,
          serves: entry.serves,
          shiftSplit: entry.shiftSplit,
          headcounts: entry.headcounts,
        },
      });
    }
    // A TemplateTimeBlock of another Church is indistinguishable from a missing one.
    const templates = await this.eventTemplateRepository.list({
      churchId: input.churchId,
    });
    const churchBlockIds = new Set<string>(
      templates.flatMap((template) => template.blocks.map((block) => block.id)),
    );
    for (const { sourceTemplateTimeBlockId } of input.entries) {
      if (!churchBlockIds.has(sourceTemplateTimeBlockId)) {
        throw new NotFoundError(
          `Template time block not found: ${sourceTemplateTimeBlockId}`,
        );
      }
    }
    await this.assertMinistryHeadcounts({
      churchId: input.churchId,
      ministryId: input.ministryId,
      headcounts: input.entries.flatMap((entry) =>
        entry.headcounts.map(({ sectorId, roleId }) => ({ sectorId, roleId })),
      ),
    });

    return this.usualSetupRepository.replaceForMinistry(input);
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
          ? await this.volunteerRepository.listByMinistry(
              input.churchId,
              participation.ministryId,
              tx,
            )
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
        this.unavailableShiftRepository.listByVolunteers(
          input.churchId,
          volunteerIds,
          tx,
        ),
        this.assignmentRepository.listByVolunteers(
          input.churchId,
          volunteerIds,
          tx,
        ),
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
    await this.ministryRepository.getById(input.churchId, input.ministryId);
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
    const planningEvent = await this.eventRepository.getEvent({
      churchId,
      eventId: participation.eventId,
      tx,
    });
    const assignments = await this.assignmentRepository.listByParticipation(
      churchId,
      participation.id,
      tx,
    );
    const volunteerIds = [
      ...new Set(
        assignments
          .filter((assignment) => isActiveAssignmentStatus(assignment.status))
          .map((assignment) => assignment.volunteerId),
      ),
    ];

    for (const volunteerId of volunteerIds) {
      await this.notificationService.notifyVolunteer({
        churchId: churchId as string,
        volunteerId: volunteerId as string,
        cycleId: planningEvent.cycleId,
        ministryId: participation.ministryId,
        eventId: planningEvent.id,
        type: 'schedule_published',
        title: 'Schedule published',
        body: `${planningEvent.title} is now published for your ministry.`,
        payload: {
          eventId: planningEvent.id as string,
          ministryId: participation.ministryId as string,
          section: 'assignments',
        },
      });
    }
  }

  async listScheduleSummaries(
    input: ListScheduleSummariesInput,
  ): Promise<ScheduleSummaryView[]> {
    await this.ministryRepository.getById(input.churchId, input.ministryId);

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

  private async getOrCreateParticipation(
    input: GetCycleParticipationInput & {
      eventId: EventWithEventTimeBlocks['event']['id'];
      tx?: TransactionContext;
    },
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
    const eventTimeBlock = await this.eventTimeBlockRepository.getById(
      churchId,
      eventTimeBlockId,
      tx,
    );

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
      this.assignmentRepository.listByParticipation(
        churchId,
        participationId,
        tx,
      ),
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
    const memberships = await this.volunteerRepository.listMinistryMemberships(
      churchId,
      ministryId,
      tx,
    );
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
      const volunteers = await this.volunteerRepository.listQualifiedForRole(
        churchId,
        participation.ministryId,
        requirement.roleId,
        tx,
      );
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
      const volunteers = await this.volunteerRepository.listQualifiedForRole(
        churchId,
        participation.ministryId,
        requirement.roleId,
        tx,
      );
      volunteersByRole.set(roleKey, volunteers);
    }

    // A shift with no requirements falls back to the whole ministry.
    const needsMinistryWide = shifts.some(
      (shift) =>
        (requirementsByShift.get(shift.id as string) ?? []).length === 0,
    );
    const volunteersInMinistry = needsMinistryWide
      ? await this.volunteerRepository.listByMinistry(
          churchId,
          participation.ministryId,
          tx,
        )
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
      this.unavailableShiftRepository.listByVolunteers(
        churchId,
        volunteerIds,
        tx,
      ),
      this.assignmentRepository.listByVolunteers(churchId, volunteerIds, tx),
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
    throw new IllegalStateTransitionError(participation.state, action);
  }
}

function buildEventView({
  eventGroup,
  participation,
  includedEventTimeBlockIds,
  shifts,
  requirements,
}: BuildEventViewInput): ParticipationEventView {
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

  const requirementsByShift = new Map<string, ShiftRequirement[]>();
  for (const requirement of requirements) {
    const key = (requirement.shiftId ?? '') as string;
    const shiftRequirements = requirementsByShift.get(key) ?? [];
    shiftRequirements.push(requirement);
    requirementsByShift.set(key, shiftRequirements);
  }

  const eventTimeBlocks: ParticipationEventTimeBlockView[] =
    eventGroup.eventTimeBlocks.map((eventTimeBlock) => {
      const eventTimeBlockShifts =
        shiftsByEventTimeBlock.get(eventTimeBlock.id as string) ?? [];
      const shiftRequirements = eventTimeBlockShifts.flatMap(
        (shift) => requirementsByShift.get(shift.id as string) ?? [],
      );

      return {
        eventTimeBlock,
        included: includedEventTimeBlockIds.has(eventTimeBlock.id as string),
        shifts: eventTimeBlockShifts,
        requirements: shiftRequirements,
      };
    });

  return {
    participation,
    event: eventGroup.event,
    eventTimeBlocks,
  };
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
