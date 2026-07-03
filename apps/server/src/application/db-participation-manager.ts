import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  CycleParticipationView,
  DeleteShiftManagerInput,
  GetCycleParticipationInput,
  GetServingProfileInput,
  IParticipationManager,
  ParticipationEventView,
  ParticipationSlotView,
  SetInclusionsInput,
  SplitShiftsManagerInput,
  UpdateShiftManagerInput,
  UpsertRequirementManagerInput,
  UpsertServingProfileInput,
} from '../domain/contracts/application/participation-manager';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { MinistryServingProfileRepository } from '../domain/contracts/infrastructure/ministry-serving-profile.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { TimeSlotRepository } from '../domain/contracts/infrastructure/time-slot.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { EventWithSlots } from '../domain/entities/event';
import type { MinistryParticipation } from '../domain/entities/ministry-participation';
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
    @inject('ITimeSlotRepository')
    private readonly timeSlotRepository: TimeSlotRepository,
    @inject('IMinistryServingProfileRepository')
    private readonly servingProfileRepository: MinistryServingProfileRepository,
    @inject('IUnitOfWork')
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async getCycleParticipation(
    input: GetCycleParticipationInput,
  ): Promise<CycleParticipationView> {
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
