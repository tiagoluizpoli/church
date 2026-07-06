import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  CreatePlanningCycleManagerInput,
  GetPlanningCycleManagerInput,
  IPlanningCycleManager,
  ListPlanningCyclesManagerInput,
  LockPlanningCycleManagerInput,
  PlanningCycleDetails,
  ReopenPlanningEventManagerInput,
} from '../domain/contracts/application/planning-cycle-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { PlanningCycleRepository } from '../domain/contracts/infrastructure/planning-cycle.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { PlanningCycle } from '../domain/entities/planning-cycle';
import {
  IllegalStateTransitionError,
  OverlappingCycleError,
} from '../domain/errors';
import { toChurchDate } from '../test-support/clock';

interface EnsureResolvedCycleInput {
  cycle: PlanningCycle;
  churchTimeZone: string;
}

@injectable()
export class DbPlanningCycleManager implements IPlanningCycleManager {
  constructor(
    @inject('IPlanningCycleRepository')
    private readonly cycleRepository: PlanningCycleRepository,
    @inject('IPlanningEventRepository')
    private readonly eventRepository: PlanningEventRepository,
    @inject('IChurchRepository')
    private readonly churchRepository: ChurchRepository,
    @inject('IUnitOfWork')
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async createCycle(
    input: CreatePlanningCycleManagerInput,
  ): Promise<PlanningCycle> {
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

  async listCycles(
    input: ListPlanningCyclesManagerInput,
  ): Promise<PlanningCycle[]> {
    const church = await this.churchRepository.getById(input.churchId);
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

  async getCycle(
    input: GetPlanningCycleManagerInput,
  ): Promise<PlanningCycleDetails> {
    const church = await this.churchRepository.getById(input.churchId);
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

  async lockCycle(input: LockPlanningCycleManagerInput): Promise<void> {
    const church = await this.churchRepository.getById(input.churchId);

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

      if (cycle.state === 'archived') {
        throw new IllegalStateTransitionError(cycle.state, 'locked');
      }

      cycle.lock();
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
    const church = await this.churchRepository.getById(input.churchId);

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
  }: EnsureResolvedCycleInput): Promise<PlanningCycle> {
    if (cycle.state === 'archived') {
      return cycle;
    }

    const today = toChurchDate({
      instant: new Date(),
      timeZone: churchTimeZone,
    });
    const cycleEnd = cycle.endDate.toISOString().slice(0, 10);

    if (today < cycleEnd) {
      return cycle;
    }

    return this.cycleRepository.updateState({
      churchId: cycle.churchId,
      cycleId: cycle.id,
      state: 'archived',
    });
  }
}
