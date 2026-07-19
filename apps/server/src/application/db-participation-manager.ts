import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type { ChurchId } from '../domain/branded-ids';
import type { ConflictIssue } from '../domain/conflict/types';
import type {
  CycleBuilderEventView,
  CycleBuilderRoleOption,
  CycleBuilderShiftView,
  CycleBuilderSlotView,
  CycleBuilderView,
  CycleParticipationView,
  DeleteShiftManagerInput,
  EligibleVolunteerView,
  GetCycleBuilderDataInput,
  GetCycleParticipationInput,
  GetParticipationCompletionInput,
  GetServingProfileInput,
  IParticipationManager,
  ListEligibleVolunteersInput,
  ListMinistryCycleSummariesInput,
  MinistryCycleSummaryView,
  ParticipationCompletionView,
  ParticipationEventView,
  ParticipationSlotView,
  PublishCycleInput,
  PublishCycleParticipationOutcome,
  PublishCycleView,
  PublishParticipationInput,
  SetInclusionsInput,
  SplitShiftsManagerInput,
  UpdateShiftManagerInput,
  UpsertRequirementManagerInput,
  UpsertServingProfileInput,
} from '../domain/contracts/application/participation-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AvailabilityRepository } from '../domain/contracts/infrastructure/availability.repository';
import {
  EVENT_BUILDER_MINISTRY_ONLY_FAIRNESS_FLAG,
  type IFeatureFlagService,
} from '../domain/contracts/infrastructure/feature-flag-service';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { MinistryServingProfileRepository } from '../domain/contracts/infrastructure/ministry-serving-profile.repository';
import type { NotificationService } from '../domain/contracts/infrastructure/notification-service';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { TimeSlotRepository } from '../domain/contracts/infrastructure/time-slot.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Assignment } from '../domain/entities/assignment';
import type { EventWithSlots } from '../domain/entities/event';
import {
  calculateCompletionPercent,
  type MinistryParticipation,
} from '../domain/entities/ministry-participation';
import { MinistryServingProfile } from '../domain/entities/ministry-serving-profile';
import { Shift } from '../domain/entities/shift';
import type { SlotRequirement } from '../domain/entities/slot-requirement';
import type { TimeSlot } from '../domain/entities/time-slot';
import {
  CrossMinistryScopeError,
  IllegalStateTransitionError,
  InvalidRequiredCountError,
} from '../domain/errors';
import { ShiftSplitter } from '../domain/services/shift-splitter';

interface EnsureTailoringInput {
  participation: MinistryParticipation;
  action: string;
}

interface ResolveParticipationSlotInput {
  churchId: GetCycleParticipationInput['churchId'];
  participation: MinistryParticipation;
  timeSlotId: SetInclusionsInput['timeSlotIds'][number];
  tx?: TransactionContext;
}

interface BuildEventViewInput {
  eventGroup: EventWithSlots;
  participation: MinistryParticipation;
  includedSlotIds: Set<string>;
  shifts: Shift[];
  requirements: SlotRequirement[];
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
  lastServedAt?: Date;
}

interface QualifiedVolunteerRef {
  id: EligibleVolunteerView['volunteerId'];
  name?: string | null;
}

interface BuildEligibleForVolunteerInput {
  volunteer: QualifiedVolunteerRef;
  shift: Shift;
  activeAssignments: Assignment[];
  fairnessAssignments: Assignment[];
  assignmentShiftsById: Map<string, Shift>;
  unavailableMarkKeys: Set<string>;
}

interface ListEligibleForShiftsInput {
  churchId: ChurchId;
  participation: MinistryParticipation;
  shifts: Shift[];
  requirements: SlotRequirement[];
  tx?: TransactionContext;
}

interface BuildBuilderEventViewInput {
  eventGroup: EventWithSlots;
  participation: MinistryParticipation;
  includedSlotIds: Set<string>;
  shifts: Shift[];
  requirements: SlotRequirement[];
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

@injectable()
export class DbParticipationManager implements IParticipationManager {
  private readonly splitter = new ShiftSplitter();

  constructor(
    @inject('IMinistryParticipationRepository')
    private readonly participationRepository: MinistryParticipationRepository,
    @inject('IShiftRepository')
    private readonly shiftRepository: ShiftRepository,
    @inject('IPlanningEventRepository')
    private readonly eventRepository: PlanningEventRepository,
    @inject('IAssignmentRepository')
    private readonly assignmentRepository: AssignmentRepository,
    @inject('IAvailabilityRepository')
    private readonly availabilityRepository: AvailabilityRepository,
    @inject('ITimeSlotRepository')
    private readonly timeSlotRepository: TimeSlotRepository,
    @inject('IVolunteerRepository')
    private readonly volunteerRepository: VolunteerRepository,
    @inject('IMinistryRepository')
    private readonly ministryRepository: MinistryRepository,
    @inject('IMinistryServingProfileRepository')
    private readonly servingProfileRepository: MinistryServingProfileRepository,
    @inject('IRoleRepository')
    private readonly roleRepository: RoleRepository,
    @inject('INotificationService')
    private readonly notificationService: NotificationService,
    @inject('IUnitOfWork')
    private readonly unitOfWork: UnitOfWork,
    @inject('IFeatureFlagService')
    private readonly featureFlagService?: IFeatureFlagService,
  ) {}

  async getCycleParticipation(
    input: GetCycleParticipationInput,
  ): Promise<CycleParticipationView> {
    await this.ministryRepository.getById(input.churchId, input.ministryId);

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
            includedSlotIds: new Set(
              inclusions.map((inclusion) => inclusion.timeSlotId as string),
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

    return this.unitOfWork.run(async (tx) => {
      const eventGroups = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });
      const roles = await this.roleRepository.listGlobalAndMinistry(
        input.churchId,
        input.ministryId,
        tx,
      );

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
          tx,
        });

        events.push(
          buildBuilderEventView({
            eventGroup,
            participation,
            includedSlotIds: new Set(
              inclusions.map((inclusion) => inclusion.timeSlotId as string),
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
      ensureTailoring({ participation, action: 'set_inclusions' });

      const previousInclusions =
        await this.participationRepository.listInclusions({
          churchId: input.churchId,
          participationId: input.participationId,
          tx,
        });
      const nextSlotIds = new Set(input.timeSlotIds as string[]);
      const removedSlotIds = previousInclusions
        .map((inclusion) => inclusion.timeSlotId)
        .filter((timeSlotId) => !nextSlotIds.has(timeSlotId as string));

      await this.participationRepository.replaceInclusions({
        churchId: input.churchId,
        participationId: input.participationId,
        timeSlotIds: input.timeSlotIds,
        tx,
      });

      for (const timeSlotId of removedSlotIds) {
        await this.shiftRepository.deleteBySlot({
          churchId: input.churchId,
          participationId: input.participationId,
          timeSlotId,
          tx,
        });
      }

      for (const timeSlotId of input.timeSlotIds) {
        const slot = await this.resolveParticipationSlot({
          churchId: input.churchId,
          participation,
          timeSlotId,
          tx,
        });
        const existingShifts = await this.shiftRepository.listBySlot({
          churchId: input.churchId,
          participationId: input.participationId,
          timeSlotId,
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
                  timeSlotId,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                },
                slotBounds: {
                  startTime: slot.startTime,
                  endTime: slot.endTime,
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
      ensureTailoring({ participation, action: 'split_shifts' });

      const slot = await this.resolveParticipationSlot({
        churchId: input.churchId,
        participation,
        timeSlotId: input.timeSlotId,
        tx,
      });

      const shifts = this.splitter.split({
        churchId: input.churchId,
        participationId: input.participationId,
        timeSlot: {
          id: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
        },
        strategy: input.strategy,
      });

      await this.shiftRepository.deleteBySlot({
        churchId: input.churchId,
        participationId: input.participationId,
        timeSlotId: input.timeSlotId,
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
        timeSlotId: input.timeSlotId,
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
      ensureTailoring({ participation, action: 'update_shift' });

      const slot = await this.timeSlotRepository.getById(
        input.churchId,
        shift.timeSlotId,
        tx,
      );

      shift.updateBounds({
        startTime: input.startTime ?? shift.startTime,
        endTime: input.endTime ?? shift.endTime,
        slotBounds: { startTime: slot.startTime, endTime: slot.endTime },
      });

      return this.shiftRepository.update({
        churchId: input.churchId,
        shiftId: input.shiftId,
        startTime: shift.startTime,
        endTime: shift.endTime,
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
      ensureTailoring({ participation, action: 'delete_shift' });

      await this.shiftRepository.deleteById({
        churchId: input.churchId,
        shiftId: input.shiftId,
        tx,
      });
    });
  }

  async upsertRequirement(
    input: UpsertRequirementManagerInput,
  ): Promise<SlotRequirement> {
    if (input.requiredCount < 1) {
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
      ensureTailoring({ participation, action: 'upsert_requirement' });

      const requirement = await this.shiftRepository.upsertRequirement({
        churchId: input.churchId,
        shiftId: input.shiftId,
        participationId: shift.participationId,
        roleId: input.roleId,
        teamId: input.teamId,
        requiredCount: input.requiredCount,
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

  async getServingProfile(
    input: GetServingProfileInput,
  ): Promise<MinistryServingProfile[]> {
    return this.servingProfileRepository.listByMinistry(input);
  }

  async upsertServingProfile(
    input: UpsertServingProfileInput,
  ): Promise<MinistryServingProfile[]> {
    // Validate every entry through the domain entity before persisting.
    for (const entry of input.entries) {
      void new MinistryServingProfile({
        props: {
          churchId: input.churchId,
          ministryId: input.ministryId,
          sourceTemplateBlockId: entry.sourceTemplateBlockId,
          serves: entry.serves,
          shiftSplit: entry.shiftSplit,
          headcounts: entry.headcounts,
        },
      });
    }

    return this.servingProfileRepository.replaceForMinistry(input);
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
      const volunteerIds = qualifiedVolunteers.map((volunteer) => volunteer.id);
      const [marks, assignments] = await Promise.all([
        this.availabilityRepository.listByVolunteers(
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
      const unavailableMarkKeys = new Set(
        marks.map(
          (mark) => `${mark.volunteerId as string}:${mark.shiftId as string}`,
        ),
      );

      const eligible = qualifiedVolunteers.map((volunteer) =>
        buildEligibleForVolunteer({
          volunteer,
          shift,
          activeAssignments,
          fairnessAssignments: activeAssignments,
          assignmentShiftsById,
          unavailableMarkKeys,
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

  async publish(input: PublishParticipationInput): Promise<void> {
    await this.unitOfWork.run(async (tx) => {
      const participation = await this.participationRepository.getById({
        churchId: input.churchId,
        participationId: input.participationId,
        tx,
      });
      if (participation.state === 'availability_fired') {
        participation.startRostering();
      }

      const completion = await this.getCompletionInternal({
        churchId: input.churchId,
        participationId: input.participationId,
        tx,
      });
      participation.publish({
        completionPercent: completion.completionPercent,
        confirmBelowFull: input.confirmBelowFull,
      });
      await this.participationRepository.updateState({
        churchId: input.churchId,
        participationId: input.participationId,
        state: participation.state,
        tx,
      });

      await this.notifyParticipationPublished({
        churchId: input.churchId,
        participation,
        tx,
      });
    });
  }

  async publishCycle(input: PublishCycleInput): Promise<PublishCycleView> {
    await this.ministryRepository.getById(input.churchId, input.ministryId);

    return this.unitOfWork.run(async (tx) => {
      const eventGroups = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });

      // Only availability-fired / rostering participations are publishable;
      // tailoring ones are not yet rostered and already-published ones are
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
          participation.state === 'availability_fired' ||
          participation.state === 'rostering'
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
        if (participation.state === 'availability_fired') {
          participation.startRostering();
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
        planningCycleId: planningEvent.planningCycleId,
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

  async listMinistryCycleSummaries(
    input: ListMinistryCycleSummariesInput,
  ): Promise<MinistryCycleSummaryView[]> {
    await this.ministryRepository.getById(input.churchId, input.ministryId);

    const rows = await this.participationRepository.listMinistryCycleSummaries({
      churchId: input.churchId,
      ministryId: input.ministryId,
    });

    return rows.map((row) => ({
      cycleId: row.cycleId as MinistryCycleSummaryView['cycleId'],
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      isPartOf: row.isPartOf,
      eventCount: row.eventCount,
      slotCount: row.slotCount,
      status: row.status,
      availabilityFiredForAll: row.availabilityFiredForAll,
      availabilityFiredForAny: row.availabilityFiredForAny,
    }));
  }

  private async getOrCreateParticipation(
    input: GetCycleParticipationInput & {
      eventId: EventWithSlots['event']['id'];
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

  private async resolveParticipationSlot({
    churchId,
    participation,
    timeSlotId,
    tx,
  }: ResolveParticipationSlotInput): Promise<TimeSlot> {
    const slot = await this.timeSlotRepository.getById(
      churchId,
      timeSlotId,
      tx,
    );

    if (slot.eventId !== participation.eventId) {
      throw new CrossMinistryScopeError();
    }

    return slot;
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
    const requiredCount = requirements.reduce(
      (sum, requirement) => sum + requirement.requiredCount,
      0,
    );
    const assignedCount = assignments.filter((assignment) =>
      isActiveAssignmentStatus(assignment.status),
    ).length;

    return {
      participationId,
      requiredCount,
      assignedCount,
      completionPercent: calculateCompletionPercent({
        assignedCount,
        requiredCount,
      }),
    };
  }

  private async listQualifiedVolunteersForShift({
    churchId,
    participation,
    requirements,
    tx,
  }: {
    churchId: ListEligibleVolunteersInput['churchId'];
    participation: MinistryParticipation;
    requirements: SlotRequirement[];
    tx?: TransactionContext;
  }) {
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
    tx,
  }: ListEligibleForShiftsInput): Promise<
    Map<string, EligibleVolunteerView[]>
  > {
    const eligibleByShift = new Map<string, EligibleVolunteerView[]>();
    if (shifts.length === 0) {
      return eligibleByShift;
    }

    const requirementsByShift = new Map<string, SlotRequirement[]>();
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
    const ministryVolunteers = needsMinistryWide
      ? await this.volunteerRepository.listByMinistry(
          churchId,
          participation.ministryId,
          tx,
        )
      : [];

    // Union of everyone who could appear so marks/assignments load once.
    const volunteersById = new Map<string, QualifiedVolunteerRef>();
    for (const volunteers of volunteersByRole.values()) {
      for (const volunteer of volunteers) {
        volunteersById.set(volunteer.id as string, volunteer);
      }
    }
    for (const volunteer of ministryVolunteers) {
      volunteersById.set(volunteer.id as string, volunteer);
    }
    const volunteerIds = [...volunteersById.values()].map(
      (volunteer) => volunteer.id,
    );

    const [marks, assignments] = await Promise.all([
      this.availabilityRepository.listByVolunteers(churchId, volunteerIds, tx),
      this.assignmentRepository.listByVolunteers(churchId, volunteerIds, tx),
    ]);
    const activeAssignments = assignments.filter((assignment) =>
      isActiveAssignmentStatus(assignment.status),
    );
    const ministryOnlyFairness =
      (await this.featureFlagService?.isEnabled(
        EVENT_BUILDER_MINISTRY_ONLY_FAIRNESS_FLAG,
        { churchId: churchId as string },
      )) ?? false;
    const participationIds = [
      ...new Set(
        activeAssignments
          .map((assignment) => assignment.participationId)
          .filter(
            (participationId): participationId is MinistryParticipation['id'] =>
              participationId != null,
          ),
      ),
    ];
    const assignmentParticipations =
      ministryOnlyFairness && participationIds.length > 0
        ? await this.participationRepository.listByIds({
            churchId,
            participationIds,
            tx,
          })
        : [];
    const ministryParticipationIds = new Set(
      assignmentParticipations
        .filter(
          (assignmentParticipation) =>
            assignmentParticipation.ministryId === participation.ministryId,
        )
        .map((assignmentParticipation) => assignmentParticipation.id),
    );
    const fairnessAssignments = ministryOnlyFairness
      ? activeAssignments.filter(
          (assignment) =>
            assignment.participationId != null &&
            ministryParticipationIds.has(assignment.participationId),
        )
      : activeAssignments;
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
    const unavailableMarkKeys = new Set(
      marks.map(
        (mark) => `${mark.volunteerId as string}:${mark.shiftId as string}`,
      ),
    );

    for (const shift of shifts) {
      const shiftRequirements =
        requirementsByShift.get(shift.id as string) ?? [];
      const qualified: QualifiedVolunteerRef[] =
        shiftRequirements.length === 0
          ? ministryVolunteers
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
          fairnessAssignments,
          assignmentShiftsById,
          unavailableMarkKeys,
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
  includedSlotIds,
  shifts,
  requirements,
  assignments,
  eligibleByShift,
}: BuildBuilderEventViewInput): CycleBuilderEventView {
  const shiftsBySlot = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const slotShifts = shiftsBySlot.get(shift.timeSlotId as string) ?? [];
    slotShifts.push(shift);
    shiftsBySlot.set(shift.timeSlotId as string, slotShifts);
  }

  const requirementsByShift = new Map<string, SlotRequirement[]>();
  for (const requirement of requirements) {
    const key = (requirement.shiftId ?? '') as string;
    const shiftRequirements = requirementsByShift.get(key) ?? [];
    shiftRequirements.push(requirement);
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

  const slots: CycleBuilderSlotView[] = eventGroup.slots.map((slot) => {
    const slotShifts = shiftsBySlot.get(slot.id as string) ?? [];
    const shiftViews: CycleBuilderShiftView[] = slotShifts.map((shift) => ({
      shift,
      requirements: requirementsByShift.get(shift.id as string) ?? [],
      assignments: assignmentsByShift.get(shift.id as string) ?? [],
      eligibleVolunteers: eligibleByShift.get(shift.id as string) ?? [],
    }));

    return {
      slot,
      included: includedSlotIds.has(slot.id as string),
      shifts: shiftViews,
    };
  });

  return {
    participation,
    event: eventGroup.event,
    slots,
  };
}

function buildEligibleForVolunteer({
  volunteer,
  shift,
  activeAssignments,
  fairnessAssignments,
  assignmentShiftsById,
  unavailableMarkKeys,
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
      (servedAt): servedAt is Date =>
        servedAt instanceof Date && servedAt < shift.startTime,
    )
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return buildEligibleVolunteerView({
    volunteerId: volunteer.id as string,
    volunteerName: volunteer.name ?? 'Unknown volunteer',
    isUnavailable: unavailableMarkKeys.has(
      `${volunteer.id as string}:${shift.id as string}`,
    ),
    activeAssignmentWarnings: warnings,
    lastServedAt,
  });
}

function toPublishCycleOutcome(
  candidate: PublishCandidate,
): PublishCycleParticipationOutcome {
  return {
    participationId: candidate.participation.id,
    state: candidate.participation.state,
    requiredCount: candidate.completion.requiredCount,
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

    const leftServedAt =
      left.lastServedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const rightServedAt =
      right.lastServedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (leftServedAt !== rightServedAt) {
      return leftServedAt - rightServedAt;
    }

    return left.volunteerName.localeCompare(right.volunteerName);
  });
}

function ensureTailoring({
  participation,
  action,
}: EnsureTailoringInput): void {
  if (participation.state !== 'tailoring') {
    throw new IllegalStateTransitionError(participation.state, action);
  }
}

function buildEventView({
  eventGroup,
  participation,
  includedSlotIds,
  shifts,
  requirements,
}: BuildEventViewInput): ParticipationEventView {
  const shiftsBySlot = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const slotShifts = shiftsBySlot.get(shift.timeSlotId as string) ?? [];
    slotShifts.push(shift);
    shiftsBySlot.set(shift.timeSlotId as string, slotShifts);
  }

  const requirementsByShift = new Map<string, SlotRequirement[]>();
  for (const requirement of requirements) {
    const key = (requirement.shiftId ?? '') as string;
    const shiftRequirements = requirementsByShift.get(key) ?? [];
    shiftRequirements.push(requirement);
    requirementsByShift.set(key, shiftRequirements);
  }

  const slots: ParticipationSlotView[] = eventGroup.slots.map((slot) => {
    const slotShifts = shiftsBySlot.get(slot.id as string) ?? [];
    const slotRequirements = slotShifts.flatMap(
      (shift) => requirementsByShift.get(shift.id as string) ?? [],
    );

    return {
      slot,
      included: includedSlotIds.has(slot.id as string),
      shifts: slotShifts,
      requirements: slotRequirements,
    };
  });

  return {
    participation,
    event: eventGroup.event,
    slots,
  };
}

function rangesOverlap({
  startTime,
  endTime,
  otherStartTime,
  otherEndTime,
}: {
  startTime: Date;
  endTime: Date;
  otherStartTime: Date;
  otherEndTime: Date;
}): boolean {
  return startTime < otherEndTime && endTime > otherStartTime;
}

function isActiveAssignmentStatus(status: string): boolean {
  return status === 'draft' || status === 'pending' || status === 'confirmed';
}

function buildDoubleBookedWarning({
  assignmentId,
}: {
  assignmentId: string;
}): ConflictIssue {
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
}: BuildEligibleVolunteerViewInput): EligibleVolunteerView {
  return {
    volunteerId: volunteerId as EligibleVolunteerView['volunteerId'],
    volunteerName,
    isAvailable: !isUnavailable,
    hasConflict: activeAssignmentWarnings.length > 0,
    lastServedAt,
  };
}
