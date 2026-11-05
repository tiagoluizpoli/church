import { NotFoundError } from '@church/core';
import { compareCalendarDays, fromDateColumn, now, today } from '@church/time';
import type {
  ChurchId,
  CycleId,
  MinistryId,
  UserId,
} from '../domain/branded-ids';
import type { IChurchNotifications } from '../domain/contracts/application/church-notifications';
import type {
  CreateCycleManagerInput,
  CycleDetails,
  CycleSendSummary,
  DeleteCycleManagerInput,
  GetCycleManagerInput,
  GetSendSummaryManagerInput,
  ICycleManager,
  ListCyclesManagerInput,
  ReopenPlanningEventManagerInput,
  SendCycleManagerInput,
  UpdateCycleManagerInput,
} from '../domain/contracts/application/cycle-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import { Cycle } from '../domain/entities/cycle';
import type { EventWithEventTimeBlocks } from '../domain/entities/event';
import {
  DraftStaffingReconciliationRequiredError,
  EmptyCycleError,
  EventOutsideCycleError,
  IllegalStateTransitionError,
  InvalidCycleEventsError,
  OverlappingCycleError,
} from '../domain/errors';
import { assertEventGraph } from '../domain/services/event-graph';
import type {
  StaffingSeedEventTimeBlock,
  UsualSetupStaffingSeeder,
} from './usual-setup-staffing-seeder';

interface EnsureResolvedCycleInput {
  cycle: Cycle;
  churchTimeZone: string;
}

interface LoadSendableCycleInput {
  churchId: ChurchId;
  cycleId: CycleId;
  timeZone: string;
  tx: TransactionContext;
}

interface SendableCycle {
  cycle: Cycle;
  draftEvents: EventWithEventTimeBlocks[];
}

interface EnqueueCycleReadyInput {
  churchId: ChurchId;
  cycleId: CycleId;
  tx: TransactionContext;
}

interface DbCycleManagerDependencies {
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
  participationRepository: MinistryParticipationRepository;
  staffingSeeder: UsualSetupStaffingSeeder;
  volunteerRepository: VolunteerRepository;
  notifications: IChurchNotifications;
}

/** The pre-fill input for every block of the Events Send schedules. */
function seedBlocksOf(
  draftEvents: EventWithEventTimeBlocks[],
): StaffingSeedEventTimeBlock[] {
  return draftEvents.flatMap((eventGroup) =>
    eventGroup.eventTimeBlocks.map((eventTimeBlock) => ({
      eventId: eventGroup.event.id,
      eventTimeBlockId: eventTimeBlock.id,
      sourceTemplateTimeBlockId: eventTimeBlock.sourceTemplateTimeBlockId,
      startTime: eventTimeBlock.startTime,
      endTime: eventTimeBlock.endTime,
    })),
  );
}

export class DbCycleManager implements ICycleManager {
  private readonly cycleRepository: CycleRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly staffingSeeder: UsualSetupStaffingSeeder;
  private readonly volunteerRepository: VolunteerRepository;
  private readonly notifications: IChurchNotifications;

  constructor({
    cycleRepository,
    eventRepository,
    churchRepository,
    unitOfWork,
    participationRepository,
    staffingSeeder,
    volunteerRepository,
    notifications,
  }: DbCycleManagerDependencies) {
    this.cycleRepository = cycleRepository;
    this.eventRepository = eventRepository;
    this.churchRepository = churchRepository;
    this.unitOfWork = unitOfWork;
    this.participationRepository = participationRepository;
    this.staffingSeeder = staffingSeeder;
    this.volunteerRepository = volunteerRepository;
    this.notifications = notifications;
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

  async getSendSummary(
    input: GetSendSummaryManagerInput,
  ): Promise<CycleSendSummary> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    // Read-only and unlocked: advisory facts that Send recomputes under the lock.
    return this.unitOfWork.run(async (tx) => {
      const { draftEvents } = await this.loadSendableCycle({
        ...input,
        timeZone: church.timezone,
        tx,
      });
      const prefilled = await this.staffingSeeder.plannedMinistryIds({
        churchId: input.churchId,
        eventTimeBlocks: seedBlocksOf(draftEvents),
        setup: await this.staffingSeeder.loadSetup({
          churchId: input.churchId,
          timeZone: church.timezone,
          tx,
        }),
        tx,
      });
      return {
        eventCount: draftEvents.length,
        prefilledMinistryCount: prefilled.size,
      };
    });
  }

  async sendCycle(input: SendCycleManagerInput): Promise<void> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    await this.unitOfWork.run(async (tx) => {
      // Serializes Send with every Cycle and Event writer of this Church, so
      // two simultaneous Sends can't both read `draft`: the second waits for
      // the first's commit, then observes `sent` and is refused.
      await this.cycleRepository.acquireChurchLock({
        churchId: input.churchId,
        tx,
      });

      const { cycle, draftEvents } = await this.loadSendableCycle({
        ...input,
        timeZone: church.timezone,
        tx,
      });

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

      cycle.send();
      await this.cycleRepository.updateState({
        churchId: input.churchId,
        cycleId: input.cycleId,
        state: cycle.state,
        tx,
      });

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
        eventTimeBlocks: seedBlocksOf(draftEvents),
        setup: await this.staffingSeeder.loadSetup({
          churchId: input.churchId,
          timeZone: church.timezone,
          tx,
        }),
        tx,
      });

      await this.enqueueCycleReady({ ...input, tx });
    });
  }

  async updateCycle(input: UpdateCycleManagerInput): Promise<Cycle> {
    const church = await this.churchRepository.getById({ id: input.churchId });
    // The desired aggregate refuses a reversed range before any write.
    const desired = new Cycle({
      props: {
        churchId: input.churchId,
        name: input.name,
        startDate: fromDateColumn({ date: input.startDate }),
        endDate: fromDateColumn({ date: input.endDate }),
      },
    });

    return this.unitOfWork.run(async (tx) => {
      // Event writers, Apply, Send and delete hold the same lock, so the state,
      // range and owned Events read below stay true until this commits.
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
          to: 'edited',
        });
      }

      const overlaps = await this.cycleRepository.findOverlapping({
        churchId: input.churchId,
        startDate: input.startDate,
        endDate: input.endDate,
        excludeCycleId: input.cycleId,
        tx,
      });

      if (overlaps.length > 0) {
        throw new OverlappingCycleError({ conflictingCycles: overlaps });
      }

      // Events are never moved to fit: any excluded start refuses the edit.
      const outside = (
        await this.eventRepository.listCycleEvents({
          churchId: input.churchId,
          cycleId: input.cycleId,
          tx,
        })
      )
        .map((eventGroup) => eventGroup.event)
        .filter(
          (event) =>
            !desired.containsDate({
              instant: event.start,
              timeZone: church.timezone,
            }),
        );

      if (outside.length > 0) {
        throw new EventOutsideCycleError({ outsideEvents: outside });
      }

      return this.cycleRepository.update({ ...input, tx });
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

  /**
   * A Draft Cycle with at least one Event, every saved graph passing the
   * shared final-graph rules; refused otherwise, before anything is written.
   */
  private async loadSendableCycle({
    churchId,
    cycleId,
    timeZone,
    tx,
  }: LoadSendableCycleInput): Promise<SendableCycle> {
    const cycle = await this.ensureResolvedCycle({
      cycle: await this.cycleRepository.getById({ churchId, cycleId, tx }),
      churchTimeZone: timeZone,
    });
    if (cycle.state !== 'draft') {
      throw new IllegalStateTransitionError({ from: cycle.state, to: 'sent' });
    }

    const draftEvents = (
      await this.eventRepository.listCycleEvents({ churchId, cycleId, tx })
    ).filter((eventGroup) => eventGroup.event.status === 'draft');
    if (draftEvents.length === 0) {
      throw new EmptyCycleError();
    }

    const invalidEvents = draftEvents.filter((eventGroup) => {
      try {
        assertEventGraph({
          graph: {
            start: eventGroup.event.start,
            end: eventGroup.event.end,
            eventTimeBlocks: eventGroup.eventTimeBlocks,
          },
          cycle,
          timeZone,
        });
        return false;
      } catch {
        return true;
      }
    });
    if (invalidEvents.length > 0) {
      throw new InvalidCycleEventsError({
        invalidEvents: invalidEvents.map((eventGroup) => eventGroup.event),
      });
    }

    return { cycle, draftEvents };
  }

  /**
   * N2 for each User actively leading an active Ministry now, listing those
   * Ministries; whether they were pre-filled does not matter. No admin
   * fallback: a Church without leaders still sends.
   */
  private async enqueueCycleReady({
    churchId,
    cycleId,
    tx,
  }: EnqueueCycleReadyInput): Promise<void> {
    const leaderships =
      await this.volunteerRepository.listActiveMinistryLeaderships({
        churchId,
        tx,
      });
    const ministryIdsByUser = new Map<UserId, MinistryId[]>();
    for (const { userId, ministryId } of leaderships) {
      const ministryIds = ministryIdsByUser.get(userId) ?? [];
      if (!ministryIds.includes(ministryId)) ministryIds.push(ministryId);
      ministryIdsByUser.set(userId, ministryIds);
    }

    for (const [userId, ministryIds] of ministryIdsByUser) {
      await this.notifications.enqueue({
        tx,
        kind: 'cycle_ready_to_prepare',
        to: [{ userId, churchId }],
        data: { cycleId, ministryIds },
      });
    }
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
