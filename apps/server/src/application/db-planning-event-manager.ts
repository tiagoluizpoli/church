import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  CancelPlanningEventManagerInput,
  CreatePlanningEventManagerInput,
  GeneratedPlanningCounts,
  GeneratePlanningTemplatesInput,
  IPlanningEventManager,
  UpdatePlanningEventManagerInput,
} from '../domain/contracts/application/planning-event-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { EventTemplateRepository } from '../domain/contracts/infrastructure/event-template.repository';
import type { PlanningCycleRepository } from '../domain/contracts/infrastructure/planning-cycle.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { Event } from '../domain/entities/event';
import type { PlanningCycle } from '../domain/entities/planning-cycle';
import {
  EventOutsidePlanningCycleError,
  IllegalStateTransitionError,
} from '../domain/errors';
import {
  CycleEventGenerator,
  type ExistingGeneratedSlotFingerprint,
} from '../domain/services/cycle-event-generator';
import { toChurchDate } from '../test-support/clock';

interface EnsurePlanningCycleWritableInput {
  cycle: PlanningCycle;
  churchTimeZone: string;
}

@injectable()
export class DbPlanningEventManager implements IPlanningEventManager {
  private readonly generator = new CycleEventGenerator();

  constructor(
    @inject('IPlanningCycleRepository')
    private readonly cycleRepository: PlanningCycleRepository,
    @inject('IPlanningEventRepository')
    private readonly eventRepository: PlanningEventRepository,
    @inject('IEventTemplateRepository')
    private readonly templateRepository: EventTemplateRepository,
    @inject('IChurchRepository')
    private readonly churchRepository: ChurchRepository,
    @inject('IUnitOfWork')
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async generateFromTemplates(
    input: GeneratePlanningTemplatesInput,
  ): Promise<GeneratedPlanningCounts> {
    const church = await this.churchRepository.getById(input.churchId);

    return this.unitOfWork.run(async (tx) => {
      const cycle = await this.ensurePlanningCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      const templates = await this.templateRepository.getByIds({
        churchId: input.churchId,
        templateIds: input.templateIds,
        tx,
      });
      const existingEvents = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });
      const plans = this.generator.generate({
        cycle,
        templates,
        existingEvents: existingEvents.map((eventGroup) => ({
          eventId: eventGroup.event.id,
          eventDate: toChurchDate({
            instant: eventGroup.event.startDate,
            timeZone: church.timezone,
          }),
          sourceTemplateId: eventGroup.event.sourceTemplateId,
        })),
        existingFingerprints: existingEvents.flatMap((eventGroup) => {
          const fingerprints: ExistingGeneratedSlotFingerprint[] = [];

          for (const slot of eventGroup.slots) {
            if (!slot.sourceTemplateBlockId) {
              continue;
            }

            fingerprints.push({
              eventDate: toChurchDate({
                instant: eventGroup.event.startDate,
                timeZone: church.timezone,
              }),
              sourceTemplateBlockId: slot.sourceTemplateBlockId,
            });
          }

          return fingerprints;
        }),
        timeZone: church.timezone,
      });

      let generatedEventCount = 0;
      let generatedSlotCount = 0;

      for (const plan of plans) {
        if (plan.kind === 'create_event') {
          const createdEvent = await this.eventRepository.createEvent({
            churchId: input.churchId,
            planningCycleId: input.cycleId,
            sourceTemplateId: plan.sourceTemplateId,
            title: plan.title,
            startDate: plan.startDate,
            endDate: plan.endDate,
            status: cycle.state === 'locked' ? 'scheduled' : 'draft',
            eventType: 'hourly',
            tx,
          });

          await this.eventRepository.seedParticipations({
            churchId: input.churchId,
            eventId: createdEvent.id,
            tx,
          });

          for (const slot of plan.slots) {
            await this.eventRepository.createTimeSlot({
              churchId: input.churchId,
              eventId: createdEvent.id,
              sourceTemplateBlockId: slot.sourceTemplateBlockId,
              startTime: slot.startTime,
              endTime: slot.endTime,
              label: slot.label,
              tx,
            });
            generatedSlotCount += 1;
          }

          generatedEventCount += 1;
          continue;
        }

        for (const slot of plan.slots) {
          await this.eventRepository.createTimeSlot({
            churchId: input.churchId,
            eventId: plan.eventId,
            sourceTemplateBlockId: slot.sourceTemplateBlockId,
            startTime: slot.startTime,
            endTime: slot.endTime,
            label: slot.label,
            tx,
          });
          generatedSlotCount += 1;
        }
      }

      return {
        generatedEventCount,
        generatedSlotCount,
      };
    });
  }

  async createEvent(input: CreatePlanningEventManagerInput): Promise<Event> {
    const church = await this.churchRepository.getById(input.churchId);

    return this.unitOfWork.run(async (tx) => {
      const cycle = await this.ensurePlanningCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });

      assertEventStartsWithinCycle({
        cycle,
        eventStartDate: input.startDate,
        churchTimeZone: church.timezone,
      });

      const event = await this.eventRepository.createEvent({
        churchId: input.churchId,
        planningCycleId: input.cycleId,
        title: input.title,
        description: input.description,
        location: input.location,
        startDate: input.startDate,
        endDate: input.endDate,
        status: cycle.state === 'locked' ? 'scheduled' : 'draft',
        eventType: input.eventType ?? 'hourly',
        tx,
      });

      await this.eventRepository.seedParticipations({
        churchId: input.churchId,
        eventId: event.id,
        tx,
      });

      return event;
    });
  }

  async updateEvent(input: UpdatePlanningEventManagerInput): Promise<Event> {
    const church = await this.churchRepository.getById(input.churchId);

    return this.unitOfWork.run(async (tx) => {
      const cycle = await this.ensurePlanningCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      const currentEvent = await this.eventRepository.getEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        tx,
      });

      if (cycle.state === 'locked' && currentEvent.status !== 'draft') {
        throw new IllegalStateTransitionError(currentEvent.status, 'update');
      }

      if (input.startDate) {
        assertEventStartsWithinCycle({
          cycle,
          eventStartDate: input.startDate,
          churchTimeZone: church.timezone,
        });
      }

      return this.eventRepository.updateEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        title: input.title,
        description: input.description,
        location: input.location,
        startDate: input.startDate,
        endDate: input.endDate,
        status: cycle.state === 'locked' ? 'scheduled' : currentEvent.status,
        tx,
      });
    });
  }

  async cancelEvent(input: CancelPlanningEventManagerInput): Promise<void> {
    const church = await this.churchRepository.getById(input.churchId);

    await this.unitOfWork.run(async (tx) => {
      const cycle = await this.ensurePlanningCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      const currentEvent = await this.eventRepository.getEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        tx,
      });

      if (cycle.state === 'locked' && currentEvent.status !== 'draft') {
        throw new IllegalStateTransitionError(currentEvent.status, 'cancel');
      }

      await this.eventRepository.updateEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        status: 'cancelled',
        tx,
      });
    });
  }

  private async ensurePlanningCycleWritable({
    cycle,
    churchTimeZone,
  }: EnsurePlanningCycleWritableInput): Promise<PlanningCycle> {
    if (cycle.state === 'archived') {
      throw new IllegalStateTransitionError(cycle.state, 'mutate');
    }

    const today = toChurchDate({
      instant: new Date(),
      timeZone: churchTimeZone,
    });
    const cycleEnd = cycle.endDate.toISOString().slice(0, 10);

    if (today >= cycleEnd) {
      await this.cycleRepository.updateState({
        churchId: cycle.churchId,
        cycleId: cycle.id,
        state: 'archived',
      });
      throw new IllegalStateTransitionError('archived', 'mutate');
    }

    return cycle;
  }
}

interface AssertEventStartsWithinCycleInput {
  cycle: PlanningCycle;
  eventStartDate: Date;
  churchTimeZone: string;
}

function assertEventStartsWithinCycle({
  cycle,
  eventStartDate,
  churchTimeZone,
}: AssertEventStartsWithinCycleInput): void {
  if (
    !cycle.containsDate({
      date: eventStartDate,
      timeZone: churchTimeZone,
    })
  ) {
    throw new EventOutsidePlanningCycleError();
  }
}
