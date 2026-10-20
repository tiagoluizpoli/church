import { NotFoundError } from '@church/core';
import { compareCalendarDays, now, today } from '@church/time';
import type {
  CreateCycleManagerInput,
  CycleDetails,
  GetCycleManagerInput,
  ICycleManager,
  ListCyclesManagerInput,
  ReopenPlanningEventManagerInput,
  SendCycleManagerInput,
} from '../domain/contracts/application/cycle-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { Cycle } from '../domain/entities/cycle';
import {
  IllegalStateTransitionError,
  OverlappingCycleError,
} from '../domain/errors';

interface EnsureResolvedCycleInput {
  cycle: Cycle;
  churchTimeZone: string;
}

interface DbCycleManagerDependencies {
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
}

export class DbCycleManager implements ICycleManager {
  private readonly cycleRepository: CycleRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    cycleRepository,
    eventRepository,
    churchRepository,
    unitOfWork,
  }: DbCycleManagerDependencies) {
    this.cycleRepository = cycleRepository;
    this.eventRepository = eventRepository;
    this.churchRepository = churchRepository;
    this.unitOfWork = unitOfWork;
  }

  async createCycle(input: CreateCycleManagerInput): Promise<Cycle> {
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
        throw new OverlappingCycleError();
      }

      return this.cycleRepository.create({
        ...input,
        tx,
      });
    });
  }

  async listCycles(input: ListCyclesManagerInput): Promise<Cycle[]> {
    const church = await this.churchRepository.getById({ id: input.churchId });
    const cycles = await this.cycleRepository.list(input);
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
        throw new IllegalStateTransitionError(cycle.state, 'sent');
      }

      cycle.send();
      await this.cycleRepository.updateState({
        churchId: input.churchId,
        cycleId: input.cycleId,
        state: cycle.state,
        tx,
      });

      const events = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });

      await Promise.all(
        events
          .filter((eventGroup) => eventGroup.event.status === 'draft')
          .map((eventGroup) =>
            this.eventRepository.updateEvent({
              churchId: input.churchId,
              eventId: eventGroup.event.id,
              status: 'scheduled',
              tx,
            }),
          ),
      );
    });
  }

  async reopenEvent(input: ReopenPlanningEventManagerInput): Promise<void> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    await this.unitOfWork.run(async (tx) => {
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

    if (compareCalendarDays({ left: churchToday, right: cycle.endDate }) < 0) {
      return cycle;
    }

    return this.cycleRepository.updateState({
      churchId: cycle.churchId,
      cycleId: cycle.id,
      state: 'past',
    });
  }
}
