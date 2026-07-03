import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  ChurchId,
  EventId,
  TimeBlockId,
  TimeSlotId,
} from '../domain/branded-ids';
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
import {
  type IFeatureFlagService,
  PARTICIPATION_DEFAULT_ALL_IN_FLAG,
} from '../domain/contracts/infrastructure/feature-flag-service';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { MinistryServingProfileRepository } from '../domain/contracts/infrastructure/ministry-serving-profile.repository';
import type { PlanningCycleRepository } from '../domain/contracts/infrastructure/planning-cycle.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { Event } from '../domain/entities/event';
import type { DefaultDirection } from '../domain/entities/ministry';
import type { PlanningCycle } from '../domain/entities/planning-cycle';
import { Shift } from '../domain/entities/shift';
import {
  EventOutsidePlanningCycleError,
  IllegalStateTransitionError,
} from '../domain/errors';
import {
  CycleEventGenerator,
  type ExistingGeneratedSlotFingerprint,
} from '../domain/services/cycle-event-generator';
import {
  ProfileSeeder,
  type ProfileSeederEntry,
} from '../domain/services/profile-seeder';
import { toChurchDate } from '../test-support/clock';

interface EnsurePlanningCycleWritableInput {
  cycle: PlanningCycle;
  churchTimeZone: string;
}

interface PlanningSeedContext {
  profilesByMinistry: Map<string, ProfileSeederEntry[]>;
  directionByMinistry: Map<string, DefaultDirection>;
  globalDefaultAllIn: boolean;
  timeZone: string;
}

interface GeneratedSlotSeedInput {
  timeSlotId: TimeSlotId;
  sourceTemplateBlockId: TimeBlockId;
  startTime: Date;
  endTime: Date;
}

interface SeedGeneratedSlotsInput {
  churchId: ChurchId;
  eventId: EventId;
  slots: GeneratedSlotSeedInput[];
  seedContext: PlanningSeedContext;
  tx: TransactionContext;
}

interface BuildSeedContextInput {
  churchId: ChurchId;
  timeZone: string;
  tx: TransactionContext;
}

@injectable()
export class DbPlanningEventManager implements IPlanningEventManager {
  private readonly generator = new CycleEventGenerator();
  private readonly profileSeeder = new ProfileSeeder();

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
    @inject('IMinistryParticipationRepository')
    private readonly participationRepository: MinistryParticipationRepository,
    @inject('IShiftRepository')
    private readonly shiftRepository: ShiftRepository,
    @inject('IMinistryServingProfileRepository')
    private readonly servingProfileRepository: MinistryServingProfileRepository,
    @inject('IMinistryRepository')
    private readonly ministryRepository: MinistryRepository,
    @inject('IFeatureFlagService')
    private readonly featureFlagService: IFeatureFlagService,
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

      const seedContext = await this.buildSeedContext({
        churchId: input.churchId,
        timeZone: church.timezone,
        tx,
      });

      let generatedEventCount = 0;
      let generatedSlotCount = 0;

      for (const plan of plans) {
        const targetEventId =
          plan.kind === 'create_event'
            ? (
                await this.eventRepository.createEvent({
                  churchId: input.churchId,
                  planningCycleId: input.cycleId,
                  sourceTemplateId: plan.sourceTemplateId,
                  title: plan.title,
                  startDate: plan.startDate,
                  endDate: plan.endDate,
                  status: cycle.state === 'locked' ? 'scheduled' : 'draft',
                  eventType: 'hourly',
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

        const createdSlots: GeneratedSlotSeedInput[] = [];

        for (const slot of plan.slots) {
          const timeSlotId = await this.eventRepository.createTimeSlot({
            churchId: input.churchId,
            eventId: targetEventId,
            sourceTemplateBlockId: slot.sourceTemplateBlockId,
            startTime: slot.startTime,
            endTime: slot.endTime,
            label: slot.label,
            tx,
          });
          createdSlots.push({
            timeSlotId,
            sourceTemplateBlockId: slot.sourceTemplateBlockId,
            startTime: slot.startTime,
            endTime: slot.endTime,
          });
          generatedSlotCount += 1;
        }

        await this.seedGeneratedSlots({
          churchId: input.churchId,
          eventId: targetEventId,
          slots: createdSlots,
          seedContext,
          tx,
        });
      }

      return {
        generatedEventCount,
        generatedSlotCount,
      };
    });
  }

  private async buildSeedContext({
    churchId,
    timeZone,
    tx,
  }: BuildSeedContextInput): Promise<PlanningSeedContext> {
    const [profiles, ministries, globalDefaultAllIn] = await Promise.all([
      this.servingProfileRepository.listByChurch({ churchId, tx }),
      this.ministryRepository.listByChurch(churchId, tx),
      this.featureFlagService.isEnabled(PARTICIPATION_DEFAULT_ALL_IN_FLAG, {
        churchId: churchId as string,
      }),
    ]);

    const profilesByMinistry = new Map<string, ProfileSeederEntry[]>();
    for (const profile of profiles) {
      const entries =
        profilesByMinistry.get(profile.ministryId as string) ?? [];
      entries.push({
        sourceTemplateBlockId: profile.sourceTemplateBlockId,
        serves: profile.serves,
        shiftSplit: profile.shiftSplit,
        headcounts: profile.headcounts,
      });
      profilesByMinistry.set(profile.ministryId as string, entries);
    }

    const directionByMinistry = new Map<string, DefaultDirection>();
    for (const ministry of ministries) {
      directionByMinistry.set(ministry.id as string, ministry.defaultDirection);
    }

    return {
      profilesByMinistry,
      directionByMinistry,
      globalDefaultAllIn,
      timeZone,
    };
  }

  private async seedGeneratedSlots({
    churchId,
    eventId,
    slots,
    seedContext,
    tx,
  }: SeedGeneratedSlotsInput): Promise<void> {
    if (slots.length === 0) {
      return;
    }

    const participations = await this.participationRepository.listByEvent({
      churchId,
      eventId,
      tx,
    });

    for (const slot of slots) {
      for (const participation of participations) {
        const seedPlan = this.profileSeeder.plan({
          slot: {
            timeSlotId: slot.timeSlotId,
            sourceTemplateBlockId: slot.sourceTemplateBlockId,
            startTime: slot.startTime,
            endTime: slot.endTime,
          },
          profileEntries:
            seedContext.profilesByMinistry.get(
              participation.ministryId as string,
            ) ?? [],
          ministryDefaultDirection: seedContext.directionByMinistry.get(
            participation.ministryId as string,
          ),
          globalDefaultAllIn: seedContext.globalDefaultAllIn,
          timeZone: seedContext.timeZone,
        });

        if (!seedPlan.include) {
          continue;
        }

        await this.participationRepository.addInclusion({
          churchId,
          participationId: participation.id,
          timeSlotId: slot.timeSlotId,
          tx,
        });

        const shiftEntities = seedPlan.shifts.map(
          (shiftPlan) =>
            new Shift({
              props: {
                churchId,
                participationId: participation.id,
                timeSlotId: slot.timeSlotId,
                startTime: shiftPlan.startTime,
                endTime: shiftPlan.endTime,
                label: shiftPlan.label,
              },
              slotBounds: {
                startTime: slot.startTime,
                endTime: slot.endTime,
              },
            }),
        );

        await this.shiftRepository.createMany({
          churchId,
          shifts: shiftEntities,
          tx,
        });

        for (const [index, shiftPlan] of seedPlan.shifts.entries()) {
          const shiftEntity = shiftEntities[index];

          if (!shiftEntity) {
            continue;
          }

          for (const headcount of shiftPlan.headcounts) {
            await this.shiftRepository.upsertRequirement({
              churchId,
              shiftId: shiftEntity.id,
              participationId: participation.id,
              roleId: headcount.roleId,
              teamId: headcount.teamId,
              requiredCount: headcount.count,
              tx,
            });
          }
        }
      }
    }
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
