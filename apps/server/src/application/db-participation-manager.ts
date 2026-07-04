import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type { ConflictIssue } from '../domain/conflict/types';
import type {
  CycleParticipationView,
  DeleteShiftManagerInput,
  EligibleVolunteerView,
  GetCycleParticipationInput,
  GetParticipationCompletionInput,
  GetServingProfileInput,
  IParticipationManager,
  ListEligibleVolunteersInput,
  ParticipationCompletionView,
  ParticipationEventView,
  ParticipationSlotView,
  PublishParticipationInput,
  SetInclusionsInput,
  SplitShiftsManagerInput,
  UpdateShiftManagerInput,
  UpsertRequirementManagerInput,
  UpsertServingProfileInput,
} from '../domain/contracts/application/participation-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AvailabilityRepository } from '../domain/contracts/infrastructure/availability.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { MinistryServingProfileRepository } from '../domain/contracts/infrastructure/ministry-serving-profile.repository';
import type { NotificationService } from '../domain/contracts/infrastructure/notification-service';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { TimeSlotRepository } from '../domain/contracts/infrastructure/time-slot.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
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
    @inject('INotificationService')
    private readonly notificationService: NotificationService,
    @inject('IUnitOfWork')
    private readonly unitOfWork: UnitOfWork,
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

      return this.shiftRepository.upsertRequirement({
        churchId: input.churchId,
        shiftId: input.shiftId,
        participationId: shift.participationId,
        roleId: input.roleId,
        teamId: input.teamId,
        requiredCount: input.requiredCount,
        notes: input.notes,
        tx,
      });
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

      const eligible = qualifiedVolunteers.map((volunteer) => {
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
              buildDoubleBookedWarning({
                assignmentId: assignment.id as string,
              }),
            ];
          });
        const lastServedAt = volunteerAssignments
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
      });

      return eligible.sort((left, right) => {
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

      const planningEvent = await this.eventRepository.getEvent({
        churchId: input.churchId,
        eventId: participation.eventId,
        tx,
      });
      const assignments = await this.assignmentRepository.listByParticipation(
        input.churchId,
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
          churchId: input.churchId as string,
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
    });
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
