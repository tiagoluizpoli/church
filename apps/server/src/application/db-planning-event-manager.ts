import { NotFoundError } from '@church/core';
import {
  addMilliseconds,
  compareCalendarDays,
  fromDate,
  millisecondsBetween,
  now,
  toDate,
  today,
} from '@church/time';
import type {
  CancelPlanningEventManagerInput,
  CreatePlanningEventManagerInput,
  CreatePlanningEventTimeBlockManagerInput,
  DeletePlanningEventTimeBlockManagerInput,
  GeneratedPlanningCounts,
  GeneratePlanningTemplatesInput,
  IPlanningEventManager,
  UpdatePlanningEventManagerInput,
  UpdatePlanningEventTimeBlockManagerInput,
} from '../domain/contracts/application/planning-event-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { EventTemplateRepository } from '../domain/contracts/infrastructure/event-template.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { Church } from '../domain/entities/church';
import type { Cycle } from '../domain/entities/cycle';
import type { Event } from '../domain/entities/event';
import type { EventTimeBlock } from '../domain/entities/event-time-block';
import {
  EventOutsideCycleError,
  IllegalStateTransitionError,
  LastRemainingEventTimeBlockError,
} from '../domain/errors';
import {
  CycleEventGenerator,
  type ExistingGeneratedEventTimeBlockFingerprint,
} from '../domain/services/cycle-event-generator';
import type {
  StaffingSeedEventTimeBlock,
  UsualSetupStaffingSeeder,
} from './usual-setup-staffing-seeder';

interface EnsureCycleWritableInput {
  cycle: Cycle;
  churchTimeZone: string;
}

/**
 * Actions that can be attempted against an event/event time block while checking
 * whether the owning cycle still allows writes. Local to
 * `DbPlanningEventManager` — the shared `IPlanningEventManager` contract has
 * no concept of this distinction.
 */
type WritableEntityAction = 'update' | 'delete';

interface EnsureWritableEventInput {
  input:
    | CreatePlanningEventTimeBlockManagerInput
    | UpdatePlanningEventTimeBlockManagerInput
    | DeletePlanningEventTimeBlockManagerInput;
  church: Church;
  action: WritableEntityAction;
  tx: TransactionContext;
}

interface GetCycleEventInput {
  input:
    | EnsureWritableEventInput['input']
    | UpdatePlanningEventManagerInput
    | CancelPlanningEventManagerInput;
  tx: TransactionContext;
}

interface LoadWritableEventTimeBlockInput {
  input:
    | UpdatePlanningEventTimeBlockManagerInput
    | DeletePlanningEventTimeBlockManagerInput;
  church: Church;
  action: WritableEntityAction;
  tx: TransactionContext;
}

interface DbPlanningEventManagerDependencies {
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  templateRepository: EventTemplateRepository;
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
  staffingSeeder: UsualSetupStaffingSeeder;
  eventTimeBlockRepository: EventTimeBlockRepository;
}

export class DbPlanningEventManager implements IPlanningEventManager {
  private readonly generator = new CycleEventGenerator();
  private readonly staffingSeeder: UsualSetupStaffingSeeder;

  private readonly cycleRepository: CycleRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly templateRepository: EventTemplateRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly eventTimeBlockRepository: EventTimeBlockRepository;

  constructor({
    cycleRepository,
    eventRepository,
    templateRepository,
    churchRepository,
    unitOfWork,
    staffingSeeder,
    eventTimeBlockRepository,
  }: DbPlanningEventManagerDependencies) {
    this.cycleRepository = cycleRepository;
    this.eventRepository = eventRepository;
    this.templateRepository = templateRepository;
    this.churchRepository = churchRepository;
    this.unitOfWork = unitOfWork;
    this.eventTimeBlockRepository = eventTimeBlockRepository;
    this.staffingSeeder = staffingSeeder;
  }

  async generateFromTemplates(
    input: GeneratePlanningTemplatesInput,
  ): Promise<GeneratedPlanningCounts> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    return this.unitOfWork.run(async (tx) => {
      const cycle = await this.ensureCycleWritable({
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
          eventDate: today({
            instant: eventGroup.event.start,
            timeZone: church.timezone,
          }),
          sourceTemplateId: eventGroup.event.sourceTemplateId,
        })),
        existingFingerprints: existingEvents.flatMap((eventGroup) => {
          const fingerprints: ExistingGeneratedEventTimeBlockFingerprint[] = [];

          for (const eventTimeBlock of eventGroup.eventTimeBlocks) {
            if (!eventTimeBlock.sourceTemplateTimeBlockId) {
              continue;
            }

            fingerprints.push({
              eventDate: today({
                instant: eventGroup.event.start,
                timeZone: church.timezone,
              }),
              sourceTemplateTimeBlockId:
                eventTimeBlock.sourceTemplateTimeBlockId,
            });
          }

          return fingerprints;
        }),
        timeZone: church.timezone,
      });

      // A Draft gets calendar copies only: Send pre-fills its staffing from
      // the setup saved by then. Blocks added to a Sent Cycle seed now.
      const setup =
        cycle.state === 'sent'
          ? await this.staffingSeeder.loadSetup({
              churchId: input.churchId,
              timeZone: church.timezone,
              tx,
            })
          : null;
      const addedEventTimeBlocks: StaffingSeedEventTimeBlock[] = [];

      let generatedEventCount = 0;
      let generatedEventTimeBlockCount = 0;

      for (const plan of plans) {
        const targetEventId =
          plan.kind === 'create_event'
            ? (
                await this.eventRepository.createEvent({
                  churchId: input.churchId,
                  cycleId: input.cycleId,
                  sourceTemplateId: plan.sourceTemplateId,
                  title: plan.title,
                  start: toDate({ instant: plan.start }),
                  end: toDate({ instant: plan.end }),
                  status: cycle.state === 'sent' ? 'scheduled' : 'draft',
                  tx,
                })
              ).id
            : plan.eventId;

        if (plan.kind === 'create_event') {
          await this.eventRepository.seedParticipations({
            churchId: input.churchId,
            eventId: targetEventId,
            tx,
          });
          generatedEventCount += 1;
        }

        for (const eventTimeBlock of plan.eventTimeBlocks) {
          const eventTimeBlockId =
            await this.eventRepository.createEventTimeBlock({
              churchId: input.churchId,
              eventId: targetEventId,
              sourceTemplateTimeBlockId:
                eventTimeBlock.sourceTemplateTimeBlockId,
              startTime: toDate({ instant: eventTimeBlock.startTime }),
              endTime: toDate({ instant: eventTimeBlock.endTime }),
              label: eventTimeBlock.label,
              tx,
            });
          addedEventTimeBlocks.push({
            eventId: targetEventId,
            eventTimeBlockId,
            sourceTemplateTimeBlockId: eventTimeBlock.sourceTemplateTimeBlockId,
            startTime: eventTimeBlock.startTime,
            endTime: eventTimeBlock.endTime,
          });
          generatedEventTimeBlockCount += 1;
        }
      }

      if (setup) {
        await this.staffingSeeder.seed({
          churchId: input.churchId,
          eventTimeBlocks: addedEventTimeBlocks,
          setup,
          tx,
        });
      }

      return {
        generatedEventCount,
        generatedEventTimeBlockCount,
      };
    });
  }

  async createEvent(input: CreatePlanningEventManagerInput): Promise<Event> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    return this.unitOfWork.run(async (tx) => {
      const cycle = await this.ensureCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });

      assertEventStartsWithinCycle({
        cycle,
        eventStart: input.start,
        churchTimeZone: church.timezone,
      });

      const event = await this.eventRepository.createEvent({
        churchId: input.churchId,
        cycleId: input.cycleId,
        title: input.title,
        description: input.description,
        location: input.location,
        start: input.start,
        end: input.end,
        status: cycle.state === 'sent' ? 'scheduled' : 'draft',
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
    const church = await this.churchRepository.getById({ id: input.churchId });

    return this.unitOfWork.run(async (tx) => {
      const cycle = await this.ensureCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      const currentEvent = await this.getCycleEvent({ input, tx });

      if (cycle.state === 'sent' && currentEvent.status !== 'draft') {
        throw new IllegalStateTransitionError({
          from: currentEvent.status,
          to: 'update',
        });
      }

      if (input.start) {
        assertEventStartsWithinCycle({
          cycle,
          eventStart: input.start,
          churchTimeZone: church.timezone,
        });
      }

      const updatedEvent = await this.eventRepository.updateEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        title: input.title,
        description: input.description,
        location: input.location,
        start: input.start,
        end: input.end,
        status: cycle.state === 'sent' ? 'scheduled' : currentEvent.status,
        tx,
      });

      const newStart = input.start
        ? fromDate({ date: input.start })
        : undefined;

      if (newStart && newStart !== currentEvent.start) {
        const delta = millisecondsBetween({
          start: currentEvent.start,
          end: newStart,
        });
        const eventTimeBlocks = await this.eventTimeBlockRepository.listByEvent(
          { churchId: input.churchId, eventId: input.eventId, tx },
        );

        // Sequential await is required here: node-postgres emits deprecation
        // warnings and will fail under pg@9.0 if concurrent queries are executed
        // on a single transaction connection (tx). Although each update targets
        // a distinct row, we must process them sequentially to preserve the
        // single-connection model used by the transaction client.
        for (const eventTimeBlock of eventTimeBlocks) {
          await this.eventTimeBlockRepository.update({
            churchId: input.churchId,
            eventTimeBlockId: eventTimeBlock.id,
            input: {
              startTime: toDate({
                instant: addMilliseconds({
                  instant: eventTimeBlock.startTime,
                  milliseconds: delta,
                }),
              }),
              endTime: toDate({
                instant: addMilliseconds({
                  instant: eventTimeBlock.endTime,
                  milliseconds: delta,
                }),
              }),
            },
            tx,
          });
        }
      }

      return updatedEvent;
    });
  }

  async createEventTimeBlock(
    input: CreatePlanningEventTimeBlockManagerInput,
  ): Promise<EventTimeBlock> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    return this.unitOfWork.run(async (tx) => {
      await this.ensureWritableEvent({ input, church, action: 'update', tx });

      return this.eventTimeBlockRepository.create({
        churchId: input.churchId,
        input: {
          eventId: input.eventId,
          startTime: input.startTime,
          endTime: input.endTime,
          label: input.label,
        },
        tx,
      });
    });
  }

  async updateEventTimeBlock(
    input: UpdatePlanningEventTimeBlockManagerInput,
  ): Promise<EventTimeBlock> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    return this.unitOfWork.run(async (tx) => {
      await this.loadWritableEventTimeBlock({
        input,
        church,
        action: 'update',
        tx,
      });

      return this.eventTimeBlockRepository.update({
        churchId: input.churchId,
        eventTimeBlockId: input.eventTimeBlockId,
        input: {
          startTime: input.startTime,
          endTime: input.endTime,
          label: input.label,
        },
        tx,
      });
    });
  }

  async deleteEventTimeBlock(
    input: DeletePlanningEventTimeBlockManagerInput,
  ): Promise<void> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    await this.unitOfWork.run(async (tx) => {
      await this.loadWritableEventTimeBlock({
        input,
        church,
        action: 'delete',
        tx,
      });

      const eventTimeBlocks = await this.eventTimeBlockRepository.listByEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        tx,
      });

      if (eventTimeBlocks.length <= 1) {
        throw new LastRemainingEventTimeBlockError();
      }

      await this.eventTimeBlockRepository.deleteById({
        churchId: input.churchId,
        eventTimeBlockId: input.eventTimeBlockId,
        tx,
      });
    });
  }

  private async ensureWritableEvent({
    input,
    church,
    action,
    tx,
  }: EnsureWritableEventInput): Promise<Event> {
    const cycle = await this.ensureCycleWritable({
      cycle: await this.cycleRepository.getById({ ...input, tx }),
      churchTimeZone: church.timezone,
    });
    const event = await this.getCycleEvent({ input, tx });

    if (cycle.state === 'sent' && event.status !== 'draft') {
      throw new IllegalStateTransitionError({ from: event.status, to: action });
    }

    return event;
  }

  /** An Event under another Cycle is as missing as an unknown Event. */
  private async getCycleEvent({
    input,
    tx,
  }: GetCycleEventInput): Promise<Event> {
    const event = await this.eventRepository.getEvent({
      churchId: input.churchId,
      eventId: input.eventId,
      tx,
    });
    if (event.cycleId !== input.cycleId) {
      throw new NotFoundError(`Event not found: ${input.eventId}`);
    }
    return event;
  }

  private async loadWritableEventTimeBlock({
    input,
    church,
    action,
    tx,
  }: LoadWritableEventTimeBlockInput): Promise<EventTimeBlock> {
    await this.ensureWritableEvent({ input, church, action, tx });

    const eventTimeBlock = await this.eventTimeBlockRepository.getById({
      churchId: input.churchId,
      eventTimeBlockId: input.eventTimeBlockId,
      tx,
    });

    if (eventTimeBlock.eventId !== input.eventId) {
      throw new NotFoundError(
        `EventTimeBlock not found: ${input.eventTimeBlockId}`,
      );
    }

    return eventTimeBlock;
  }

  async cancelEvent(input: CancelPlanningEventManagerInput): Promise<void> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    await this.unitOfWork.run(async (tx) => {
      const cycle = await this.ensureCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      const currentEvent = await this.getCycleEvent({ input, tx });

      if (cycle.state === 'sent' && currentEvent.status !== 'draft') {
        throw new IllegalStateTransitionError({
          from: currentEvent.status,
          to: 'cancel',
        });
      }

      // Delete and cancel are distinct operations, split on the event's
      // lifecycle status (BL-020 / issue #12). A `draft` event has never
      // reached `scheduled`: its assignments are still `draft` and no
      // volunteer has seen it, so removing it destroys nothing anyone saw —
      // hard-delete it (event time blocks/shifts/draft assignments/audits cascade). Any
      // later status is a silent soft cancel, byte-for-byte the prior
      // behaviour.
      if (currentEvent.status === 'draft') {
        await this.eventRepository.deleteEvent({
          churchId: input.churchId,
          eventId: input.eventId,
          tx,
        });
        return;
      }

      await this.eventRepository.updateEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        status: 'cancelled',
        tx,
      });
    });
  }

  private async ensureCycleWritable({
    cycle,
    churchTimeZone,
  }: EnsureCycleWritableInput): Promise<Cycle> {
    if (cycle.state === 'past') {
      throw new IllegalStateTransitionError({
        from: cycle.state,
        to: 'mutate',
      });
    }

    const churchToday = today({ instant: now(), timeZone: churchTimeZone });

    if (compareCalendarDays({ left: churchToday, right: cycle.endDate }) >= 0) {
      await this.cycleRepository.updateState({
        churchId: cycle.churchId,
        cycleId: cycle.id,
        state: 'past',
      });
      throw new IllegalStateTransitionError({ from: 'past', to: 'mutate' });
    }

    return cycle;
  }
}

interface AssertEventStartsWithinCycleInput {
  cycle: Cycle;
  eventStart: Date;
  churchTimeZone: string;
}

function assertEventStartsWithinCycle({
  cycle,
  eventStart,
  churchTimeZone,
}: AssertEventStartsWithinCycleInput): void {
  if (
    !cycle.containsDate({
      instant: fromDate({ date: eventStart }),
      timeZone: churchTimeZone,
    })
  ) {
    throw new EventOutsideCycleError();
  }
}
