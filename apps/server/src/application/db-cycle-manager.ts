import {
  addCalendarDays,
  addCalendarMonths,
  compareCalendarDays,
  firstOfMonth,
  fromDateColumn,
  now,
  parseTimeOfDay,
  toDate,
  today,
  toInstant,
} from '@church/time';
import type { MinistryId, UserId } from '../domain/branded-ids';
import type { IChurchNotifications } from '../domain/contracts/application/church-notifications';
import type {
  CreateCycleManagerInput,
  CycleDetails,
  CycleSendSummary,
  DbCycleManagerDependencies,
  DeleteCycleManagerInput,
  EnqueueCycleReadyInput,
  EnsureResolvedCycleInput,
  GetCycleAnchorsManagerInput,
  GetCycleManagerInput,
  GetSendSummaryManagerInput,
  ICycleManager,
  ListCyclesManagerInput,
  LoadSendableCycleInput,
  SendableCycle,
  SendCycleManagerInput,
  SuggestNextCycleInput,
  UpdateCycleManagerInput,
} from '../domain/contracts/application/cycle-manager';
import type {
  IUsualSetupStaffingSeeder,
  StaffingSeedEventTimeBlock,
} from '../domain/contracts/application/usual-setup-staffing-seeder';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import {
  Cycle,
  type CycleAnchors,
  type CycleList,
  type CyclePeriod,
  type CycleState,
  type NextCycleSuggestion,
} from '../domain/entities/cycle';
import type { EventWithEventTimeBlocks } from '../domain/entities/event';
import {
  DraftStaffingReconciliationRequiredError,
  EmptyCycleError,
  EventOutsideCycleError,
  IllegalStateTransitionError,
  InvalidCycleEventsError,
  OverlappingCycleError,
} from '../domain/errors';
import { assertEventGraph } from '../domain/services/planning/event-graph';

/** The day after the latest Cycle, never before this month, to its month's end. */
export function suggestNextCycle({
  latestEnd,
  churchToday,
}: SuggestNextCycleInput): NextCycleSuggestion {
  const thisMonth = firstOfMonth({ day: churchToday });
  const afterLatest = latestEnd
    ? addCalendarDays({ day: latestEnd, days: 1 })
    : thisMonth;
  const startDate =
    compareCalendarDays({ left: afterLatest, right: thisMonth }) < 0
      ? thisMonth
      : afterLatest;
  return {
    startDate,
    endDate: addCalendarDays({
      day: addCalendarMonths({ day: startDate, months: 1 }),
      days: -1,
    }),
    isDue:
      compareCalendarDays({
        left: startDate,
        right: addCalendarMonths({ day: churchToday, months: 2 }),
      }) < 0,
  };
}

const PERIOD_STATES: Record<CyclePeriod, CycleState[]> = {
  current: ['draft', 'sent'],
  past: ['past'],
};

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
  private readonly staffingSeeder: IUsualSetupStaffingSeeder;
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

  async listCycles(input: ListCyclesManagerInput): Promise<CycleList> {
    const church = await this.churchRepository.getById({ id: input.churchId });
    const churchToday = today({ instant: now(), timeZone: church.timezone });
    // Resolved before the state filter, so a Cycle that elapsed while still
    // stored as Draft or Sent is found and counted as Past.
    const todayDate = toDate({
      instant: toInstant({
        day: churchToday,
        time: parseTimeOfDay({ value: '00:00' }),
        timeZone: 'UTC',
      }),
    });
    await this.cycleRepository.resolveElapsed({
      churchId: input.churchId,
      today: todayDate,
    });
    const [cycles, counts] = await Promise.all([
      this.cycleRepository.list({
        churchId: input.churchId,
        states: input.state
          ? [input.state]
          : input.period
            ? PERIOD_STATES[input.period]
            : undefined,
        search: input.search,
        from: input.from,
        to: input.to,
      }),
      this.cycleRepository.countByState({ churchId: input.churchId }),
    ]);

    const narrowed = Boolean(input.search || input.from || input.to);
    const [eventCounts, latestEnd, pastMatching, anchors] = await Promise.all([
      this.cycleRepository.countEvents({
        churchId: input.churchId,
        cycleIds: cycles.map((listed) => listed.id),
      }),
      this.cycleRepository.findLatestEnd({ churchId: input.churchId }),
      narrowed
        ? this.cycleRepository.count({
            churchId: input.churchId,
            states: ['past'],
            search: input.search,
            from: input.from,
            to: input.to,
          })
        : counts.past,
      this.cycleRepository.findAnchors({
        churchId: input.churchId,
        today: todayDate,
      }),
    ]);

    return {
      cycles,
      counts,
      eventCounts,
      pastMatching,
      currentCycleId: anchors.current?.id ?? null,
      next: suggestNextCycle({ latestEnd, churchToday }),
    };
  }

  async getCycleAnchors(
    input: GetCycleAnchorsManagerInput,
  ): Promise<CycleAnchors> {
    const church = await this.churchRepository.getById({ id: input.churchId });
    const churchToday = today({ instant: now(), timeZone: church.timezone });
    // Both anchors end on or after today, so neither needs lazy Past resolution.
    return this.cycleRepository.findAnchors({
      churchId: input.churchId,
      today: toDate({
        instant: toInstant({
          day: churchToday,
          time: parseTimeOfDay({ value: '00:00' }),
          timeZone: 'UTC',
        }),
      }),
    });
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
    // A cancelled Event takes its EventTimeBlocks with it, whatever theirs say.
    const planned = events.filter(({ event }) => event.status !== 'cancelled');
    const counts = {
      eventCount: planned.length,
      eventTimeBlockCount: planned
        .flatMap(({ eventTimeBlocks }) => eventTimeBlocks)
        .filter(({ status }) => status !== 'cancelled').length,
    };

    return { cycle, events, counts };
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
        tx,
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
        tx,
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
      tx,
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
    tx,
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
      tx,
    });
  }
}
