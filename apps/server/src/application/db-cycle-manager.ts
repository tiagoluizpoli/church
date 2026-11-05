import { NotFoundError } from '@church/core';
import { compareCalendarDays, fromDateColumn, now, today } from '@church/time';
import type {
  CreateCycleManagerInput,
  CycleDetails,
  DeleteCycleManagerInput,
  GetCycleManagerInput,
  ICycleManager,
  ListCyclesManagerInput,
  ReopenPlanningEventManagerInput,
  SendCycleManagerInput,
} from '../domain/contracts/application/cycle-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import { Cycle } from '../domain/entities/cycle';
import {
  DraftStaffingReconciliationRequiredError,
  IllegalStateTransitionError,
  OverlappingCycleError,
} from '../domain/errors';
import type { UsualSetupStaffingSeeder } from './usual-setup-staffing-seeder';

interface EnsureResolvedCycleInput {
  cycle: Cycle;
  churchTimeZone: string;
}

interface DbCycleManagerDependencies {
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
  participationRepository: MinistryParticipationRepository;
  staffingSeeder: UsualSetupStaffingSeeder;
}

export class DbCycleManager implements ICycleManager {
  private readonly cycleRepository: CycleRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly staffingSeeder: UsualSetupStaffingSeeder;

  constructor({
    cycleRepository,
    eventRepository,
    churchRepository,
    unitOfWork,
    participationRepository,
    staffingSeeder,
  }: DbCycleManagerDependencies) {
    this.cycleRepository = cycleRepository;
    this.eventRepository = eventRepository;
    this.churchRepository = churchRepository;
    this.unitOfWork = unitOfWork;
    this.participationRepository = participationRepository;
    this.staffingSeeder = staffingSeeder;
  }

  async createCycle(input: CreateCycleManagerInput): Promise<Cycle> {
    // The desired aggregate refuses a reversed range before any write.
    new Cycle({
      props: {
        churchId: input.churchId,
        name: input.name,
        startDate: fromDateColumn({ date: input.startDate }),
        endDate: fromDateColumn({ date: input.endDate }),
      },
    });

    return this.unitOfWork.run(async (tx) => {
      await this.cycleRepository.acquireChurchLock({
        churchId: input.churchId,
        tx,
      });

      const overlaps = await this.cycleRepository.findOverlapping({
        churchId: input.churchId,
        startDate: input.startDate,
        endDate: input.endDate,
        tx,
      });

      if (overlaps.length > 0) {
        throw new OverlappingCycleError({ conflictingCycles: overlaps });
      }

      return this.cycleRepository.create({
        ...input,
        tx,
      });
    });
  }

  async listCycles(input: ListCyclesManagerInput): Promise<Cycle[]> {
    const church = await this.churchRepository.getById({ id: input.churchId });
    // Every row is resolved before the state filter, so a Cycle that elapsed
    // while still stored as Draft or Sent is found as Past.
    const cycles = await this.cycleRepository.list({
      churchId: input.churchId,
    });
    const resolvedCycles = await Promise.all(
      cycles.map((cycle) =>
        this.ensureResolvedCycle({
          cycle,
          churchTimeZone: church.timezone,
        }),
      ),
    );

    return input.state
      ? resolvedCycles.filter((cycle) => cycle.state === input.state)
      : resolvedCycles;
  }

  async getCycle(input: GetCycleManagerInput): Promise<CycleDetails> {
    const church = await this.churchRepository.getById({ id: input.churchId });
    const cycle = await this.ensureResolvedCycle({
      cycle: await this.cycleRepository.getById(input),
      churchTimeZone: church.timezone,
    });
    const events = await this.eventRepository.listCycleEvents({
      churchId: input.churchId,
      cycleId: input.cycleId,
    });

    return { cycle, events };
  }

  async sendCycle(input: SendCycleManagerInput): Promise<void> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    await this.unitOfWork.run(async (tx) => {
      // Serializes concurrent lock attempts on this church's cycles so two
      // simultaneous requests can't both read `draft` and both transition —
      // the second waits for the first's commit, then observes `locked` and
      // rejects (DL4-X3).
      await this.cycleRepository.acquireChurchLock({
        churchId: input.churchId,
        tx,
      });

      const cycle = await this.ensureResolvedCycle({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });

      if (cycle.state === 'past') {
        throw new IllegalStateTransitionError({
          from: cycle.state,
          to: 'sent',
        });
      }

      cycle.send();

      // No staffing row records its origin, so none can be proven provisional:
      // a Draft that already holds any is refused untouched, never replaced.
      if (
        await this.participationRepository.hasCycleStaffing({
          churchId: input.churchId,
          cycleId: input.cycleId,
          tx,
        })
      ) {
        throw new DraftStaffingReconciliationRequiredError({
          cycleId: input.cycleId,
        });
      }

      await this.cycleRepository.updateState({
        churchId: input.churchId,
        cycleId: input.cycleId,
        state: cycle.state,
        tx,
      });

      const draftEvents = (
        await this.eventRepository.listCycleEvents({
          churchId: input.churchId,
          cycleId: input.cycleId,
          tx,
        })
      ).filter((eventGroup) => eventGroup.event.status === 'draft');

      // Sequential: concurrent queries on one transaction connection warn in pg.
      for (const eventGroup of draftEvents) {
        await this.eventRepository.updateEvent({
          churchId: input.churchId,
          eventId: eventGroup.event.id,
          status: 'scheduled',
          tx,
        });
      }

      await this.staffingSeeder.seed({
        churchId: input.churchId,
        eventTimeBlocks: draftEvents.flatMap((eventGroup) =>
          eventGroup.eventTimeBlocks.map((eventTimeBlock) => ({
            eventId: eventGroup.event.id,
            eventTimeBlockId: eventTimeBlock.id,
            sourceTemplateTimeBlockId: eventTimeBlock.sourceTemplateTimeBlockId,
            startTime: eventTimeBlock.startTime,
            endTime: eventTimeBlock.endTime,
          })),
        ),
        setup: await this.staffingSeeder.loadSetup({
          churchId: input.churchId,
          timeZone: church.timezone,
          tx,
        }),
        tx,
      });
    });
  }

  async deleteCycle(input: DeleteCycleManagerInput): Promise<void> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    await this.unitOfWork.run(async (tx) => {
      // The Event-count the admin confirmed is informational: the owned graph
      // is whatever exists once the lock is held.
      await this.cycleRepository.acquireChurchLock({
        churchId: input.churchId,
        tx,
      });

      const cycle = await this.ensureResolvedCycle({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });

      if (cycle.state !== 'draft') {
        throw new IllegalStateTransitionError({
          from: cycle.state,
          to: 'deleted',
        });
      }

      await this.cycleRepository.delete({ ...input, tx });
    });
  }

  async reopenEvent(input: ReopenPlanningEventManagerInput): Promise<void> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    await this.unitOfWork.run(async (tx) => {
      await this.cycleRepository.acquireChurchLock({
        churchId: input.churchId,
        tx,
      });

      const cycle = await this.ensureResolvedCycle({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      const event = await this.eventRepository.getEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        tx,
      });
      // An Event under another Cycle is as missing as an unknown Event.
      if (event.cycleId !== input.cycleId) {
        throw new NotFoundError(`Event not found: ${input.eventId}`);
      }

      cycle.assertCanReopenEvent({ eventState: event.status });
      await this.eventRepository.updateEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        status: 'draft',
        tx,
      });
    });
  }

  private async ensureResolvedCycle({
    cycle,
    churchTimeZone,
  }: EnsureResolvedCycleInput): Promise<Cycle> {
    if (cycle.state === 'past') {
      return cycle;
    }

    const churchToday = today({ instant: now(), timeZone: churchTimeZone });

    // endDate is the Cycle's last day: it elapses on the following Church day.
    if (compareCalendarDays({ left: churchToday, right: cycle.endDate }) <= 0) {
      return cycle;
    }

    return this.cycleRepository.updateState({
      churchId: cycle.churchId,
      cycleId: cycle.id,
      state: 'past',
    });
  }
}
