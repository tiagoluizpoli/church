import { NotFoundError } from '@church/core';
import {
  addMilliseconds,
  compareCalendarDays,
  type Instant,
  millisecondsBetween,
  now,
  toDate,
  today,
} from '@church/time';
import {
  decodeAnswersListCursor,
  encodeAnswersListCursor,
} from '../domain/answers-list-cursor';
import type {
  AnswerStatus,
  AskPreview,
  AskScheduleInput,
  AskScheduleResult,
  CheckStatusRow,
  CompareRowsInput,
  CycleCheckStatuses,
  DbAvailabilityCheckManagerDependencies,
  EnsureCycleAskableInput,
  FlaggedBlocksOfInput,
  GetAskPreviewInput,
  IAvailabilityCheckManager,
  ListCycleCheckStatusesInput,
  LockUnpublishedScheduleInput,
  OpenChecksInput,
  OpenChecksResult,
  PagedStatuses,
  PageStatusesInput,
  RemindAvailableAtInput,
  RemindScheduleInput,
  RemindScheduleResult,
  SetDeadlineInput,
} from '../domain/contracts/application/availability-check-manager';
import type { IChurchNotifications } from '../domain/contracts/application/church-notifications';
import type { AvailabilityCheckRepository } from '../domain/contracts/infrastructure/availability-check.repository';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import { deriveScheduleStage } from '../domain/entities/ministry-participation';
import { IllegalStateTransitionError } from '../domain/errors';
import {
  AskBlockedFlaggedShiftsError,
  type FlaggedBlock,
} from '../domain/errors/ask-blocked-flagged-shifts';
import { AskNoEligibleVolunteersError } from '../domain/errors/ask-no-eligible-volunteers';
import { RemindOnCooldownError } from '../domain/errors/remind-on-cooldown';

const ASK_TRANSITION = 'ask_availability';
const DEADLINE_TRANSITION = 'set_deadline';
const REMIND_TRANSITION = 'remind';

function flaggedBlocksOf({
  servedShifts,
}: FlaggedBlocksOfInput): FlaggedBlock[] {
  const startByBlock = new Map(
    servedShifts
      .filter((shift) => shift.flagged)
      .map((shift) => [shift.eventTimeBlockId, shift.eventTimeBlockStartsAt]),
  );
  return Array.from(startByBlock, ([eventTimeBlockId, startsAt]) => ({
    eventTimeBlockId,
    startsAt,
  }));
}

/** Only a Sent Cycle that has not ended can be asked about. */
function ensureCycleAskable({
  cycle,
  timeZone,
  transition,
}: EnsureCycleAskableInput): void {
  const churchToday = today({ instant: now(), timeZone });
  if (compareCalendarDays({ left: churchToday, right: cycle.endDate }) > 0) {
    throw new IllegalStateTransitionError({ from: 'past', to: transition });
  }
  if (cycle.state !== 'sent') {
    throw new IllegalStateTransitionError({
      from: cycle.state,
      to: transition,
    });
  }
}

function answerStatusOf({
  state,
  unavailableShiftCount,
}: CheckStatusRow): AnswerStatus {
  if (state !== 'confirmed') return 'pending';
  return unavailableShiftCount > 0 ? 'unavailable' : 'available';
}

function compareRows({ left, right }: CompareRowsInput): number {
  return (
    left.volunteerName.localeCompare(right.volunteerName) ||
    left.volunteerId.localeCompare(right.volunteerId)
  );
}

/** Filters, totally orders (name, id) and keyset-pages the asked Volunteers. */
function pageStatuses({
  statuses,
  status,
  q,
  cursor,
  limit,
}: PageStatusesInput): PagedStatuses {
  const needle = q?.trim().toLowerCase();
  const position = cursor ? decodeAnswersListCursor({ cursor }) : undefined;
  const after = position
    ? ({
        volunteerName: position.name,
        volunteerId: position.id,
      } as CheckStatusRow)
    : undefined;
  const matching = statuses
    .filter((row) => !status || answerStatusOf(row) === status)
    .filter(
      (row) => !needle || row.volunteerName.toLowerCase().includes(needle),
    )
    .sort((left, right) => compareRows({ left, right }))
    .filter((row) => !after || compareRows({ left: row, right: after }) > 0);
  if (limit === undefined || matching.length <= limit) {
    return { statuses: matching, nextCursor: null };
  }
  const page = matching.slice(0, limit);
  const last = page.at(-1);
  return {
    statuses: page,
    nextCursor: last
      ? encodeAnswersListCursor({
          name: last.volunteerName,
          id: last.volunteerId,
        })
      : null,
  };
}

export class DbAvailabilityCheckManager implements IAvailabilityCheckManager {
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly availabilityCheckRepository: AvailabilityCheckRepository;
  private readonly cycleRepository: CycleRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly notifications: IChurchNotifications;
  private readonly unitOfWork: UnitOfWork;
  private readonly reminderCooldownMs: number;

  constructor({
    participationRepository,
    availabilityCheckRepository,
    cycleRepository,
    ministryRepository,
    churchRepository,
    notifications,
    unitOfWork,
    config,
  }: DbAvailabilityCheckManagerDependencies) {
    this.participationRepository = participationRepository;
    this.availabilityCheckRepository = availabilityCheckRepository;
    this.cycleRepository = cycleRepository;
    this.ministryRepository = ministryRepository;
    this.churchRepository = churchRepository;
    this.notifications = notifications;
    this.unitOfWork = unitOfWork;
    this.reminderCooldownMs = config.availability.reminderCooldownMs;
  }

  async getAskPreview(input: GetAskPreviewInput): Promise<AskPreview> {
    const { churchId, cycleId, ministryId } = input;
    const ministry = await this.ministryRepository.getById({
      churchId,
      id: ministryId,
    });
    if (ministry.deletedAt)
      throw new NotFoundError(`Ministry not found: ${ministryId}`);
    await this.cycleRepository.getById({ churchId, cycleId });

    const [eligibleMemberships, servedShifts, rolesWithoutHolders] =
      await Promise.all([
        this.availabilityCheckRepository.listEligibleMemberships(input),
        this.availabilityCheckRepository.listServedShifts(input),
        this.availabilityCheckRepository.listRolesWithoutHolders(input),
      ]);
    return {
      eligibleVolunteerCount: eligibleMemberships.length,
      shiftCount: servedShifts.length,
      eventCount: new Set(servedShifts.map((shift) => shift.eventId)).size,
      flaggedBlocks: flaggedBlocksOf({ servedShifts }),
      rolesWithoutHolders,
    };
  }

  async askSchedule({
    churchId,
    ministryId,
    cycleId,
    answerBy,
  }: AskScheduleInput): Promise<AskScheduleResult> {
    const { timezone: timeZone } = await this.churchRepository.getById({
      id: churchId,
    });

    return this.unitOfWork.run(async (tx) => {
      const scope = { churchId, ministryId, cycleId, tx };
      // An archived Ministry is not found for new use.
      await this.ministryRepository.lockActive({
        churchId,
        ministryId,
        strength: 'share',
        tx,
      });
      const cycle = await this.cycleRepository.getById({
        churchId,
        cycleId,
        tx,
      });
      ensureCycleAskable({ cycle, timeZone, transition: ASK_TRANSITION });

      // Locked so a concurrent repeat Ask sees the moved state and refuses.
      const participations =
        await this.participationRepository.lockSchedule(scope);
      for (const participation of participations) {
        participation.askAvailability();
      }

      const servedShifts =
        await this.availabilityCheckRepository.listServedShifts(scope);
      const flaggedBlocks = flaggedBlocksOf({ servedShifts });
      if (flaggedBlocks.length > 0) {
        throw new AskBlockedFlaggedShiftsError({ flaggedBlocks });
      }

      const eligible =
        await this.availabilityCheckRepository.listEligibleMemberships(scope);
      if (eligible.length === 0) {
        throw new AskNoEligibleVolunteersError();
      }

      for (const participation of participations) {
        await this.participationRepository.updateState({
          churchId,
          participationId: participation.id,
          state: participation.state,
          tx,
        });
      }
      await this.availabilityCheckRepository.createAskRecord({
        ...scope,
        askedAt: toDate({ instant: now() }),
        answerBy,
      });
      const opened = await this.openChecks({ ...scope, eligible });
      const rolesWithoutHolders =
        await this.availabilityCheckRepository.listRolesWithoutHolders(scope);

      return { ...opened, rolesWithoutHolders };
    });
  }

  async remindSchedule({
    churchId,
    ministryId,
    cycleId,
  }: RemindScheduleInput): Promise<RemindScheduleResult> {
    const { timezone: timeZone } = await this.churchRepository.getById({
      id: churchId,
    });

    return this.unitOfWork.run(async (tx) => {
      const scope = { churchId, ministryId, cycleId, tx };
      await this.lockUnpublishedSchedule({
        ...scope,
        timeZone,
        transition: REMIND_TRANSITION,
      });
      const askRecord =
        await this.availabilityCheckRepository.findAskRecord(scope);
      if (!askRecord) {
        throw new IllegalStateTransitionError({
          from: 'not_asked',
          to: REMIND_TRANSITION,
        });
      }

      const remindedAt = now();
      const remindAvailableAt = this.remindAvailableAt(askRecord);
      if (remindAvailableAt) {
        throw new RemindOnCooldownError({ remindAvailableAt });
      }

      // Read before the sweep: a check it creates gets the opened notice, never the reminder.
      const memberships =
        await this.availabilityCheckRepository.listActiveMemberships(scope);
      const checks = await this.availabilityCheckRepository.listByCycle({
        churchId,
        cycleId,
        ministryMembershipIds: memberships.map(
          ({ ministryMembershipId }) => ministryMembershipId,
        ),
        tx,
      });
      const pendingCheckIds = new Map(
        checks
          .filter(({ state }) => state === 'pending')
          .map(({ ministryMembershipId, id }) => [ministryMembershipId, id]),
      );
      const notConfirmed = memberships.filter(({ ministryMembershipId }) =>
        pendingCheckIds.has(ministryMembershipId),
      );
      const eligible =
        await this.availabilityCheckRepository.listEligibleMemberships(scope);

      const { createdCheckCount } = await this.openChecks({
        ...scope,
        eligible,
      });
      for (const { ministryMembershipId, userId } of notConfirmed) {
        await this.notifications.enqueue({
          tx,
          kind: 'availability_reminder',
          to: [{ userId, churchId }],
          data: {
            cycleId,
            ministryId,
            checkId: pendingCheckIds.get(ministryMembershipId),
          },
        });
      }
      await this.availabilityCheckRepository.stampReminded({
        ...scope,
        remindedAt: toDate({ instant: remindedAt }),
      });

      return {
        remindedCount: notConfirmed.length,
        newCheckCount: createdCheckCount,
        remindAvailableAt: addMilliseconds({
          instant: remindedAt,
          milliseconds: this.reminderCooldownMs,
        }),
      };
    });
  }

  /** Refuses an archived Ministry, a closed Cycle and a published Schedule; locked so a concurrent publish waits. */
  private async lockUnpublishedSchedule({
    timeZone,
    transition,
    ...scope
  }: LockUnpublishedScheduleInput): Promise<void> {
    const { churchId, cycleId, ministryId, tx } = scope;
    await this.ministryRepository.lockActive({
      churchId,
      ministryId,
      strength: 'share',
      tx,
    });
    const cycle = await this.cycleRepository.getById({ churchId, cycleId, tx });
    ensureCycleAskable({ cycle, timeZone, transition });

    await this.participationRepository.lockSchedule(scope);
    // Read after the lock. A cancelled Event's rows do not count; a cancelled
    // block's do, since Ask moves every participation of the Schedule together.
    const servingRows =
      await this.participationRepository.listScheduleServingStates({
        churchId,
        ministryIds: [ministryId],
        cycleIds: [cycleId],
        tx,
      });
    const servingStates = servingRows.map(({ state }) => state);
    if (deriveScheduleStage({ servingStates }) === 'published') {
      throw new IllegalStateTransitionError({
        from: 'published',
        to: transition,
      });
    }
  }

  /** Creates the missing checks and enqueues availability_opened for exactly those Volunteers. */
  private async openChecks({
    churchId,
    ministryId,
    cycleId,
    tx,
    eligible,
  }: OpenChecksInput): Promise<OpenChecksResult> {
    // A membership that once held a withdrawn check keeps it: no new check, no notice.
    const created = await this.availabilityCheckRepository.createMany({
      churchId,
      checks: eligible.map(({ ministryMembershipId }) => ({
        cycleId,
        ministryMembershipId,
      })),
      tx,
    });
    const recipientsByMembership = new Map(
      eligible.map(({ ministryMembershipId, userId }) => [
        ministryMembershipId,
        userId,
      ]),
    );
    for (const check of created) {
      const userId = recipientsByMembership.get(check.ministryMembershipId);
      if (!userId) continue;
      await this.notifications.enqueue({
        tx,
        kind: 'availability_opened',
        to: [{ userId, churchId }],
        data: { cycleId, ministryId, checkId: check.id },
      });
    }
    return {
      createdCheckCount: created.length,
      notifiedVolunteerCount: created.length,
    };
  }

  async setDeadline({
    churchId,
    ministryId,
    cycleId,
    answerBy,
  }: SetDeadlineInput): Promise<void> {
    const { timezone: timeZone } = await this.churchRepository.getById({
      id: churchId,
    });

    await this.unitOfWork.run(async (tx) => {
      const scope = { churchId, ministryId, cycleId, tx };
      await this.lockUnpublishedSchedule({
        ...scope,
        timeZone,
        transition: DEADLINE_TRANSITION,
      });

      const asked = await this.availabilityCheckRepository.setAnswerBy({
        ...scope,
        answerBy,
      });
      if (!asked) {
        throw new IllegalStateTransitionError({
          from: 'not_asked',
          to: DEADLINE_TRANSITION,
        });
      }
    });
  }

  async listCycleCheckStatuses(
    input: ListCycleCheckStatusesInput,
  ): Promise<CycleCheckStatuses> {
    const { churchId, cycleId, ministryId } = input;
    const ministry = await this.ministryRepository.getById({
      churchId,
      id: ministryId,
    });
    if (ministry.deletedAt)
      throw new NotFoundError(`Ministry not found: ${ministryId}`);
    await this.cycleRepository.getById({ churchId, cycleId });

    const [memberships, markCounts, shiftTotals, answerBy, askRecord] =
      await Promise.all([
        this.availabilityCheckRepository.listActiveMemberships(input),
        this.availabilityCheckRepository.listCheckMarkCounts(input),
        this.availabilityCheckRepository.listRelevantShiftTotals(input),
        this.availabilityCheckRepository.findAnswerBy(input),
        this.availabilityCheckRepository.findAskRecord(input),
      ]);
    const checks = await this.availabilityCheckRepository.listByCycle({
      churchId,
      cycleId,
      ministryMembershipIds: memberships.map(
        ({ ministryMembershipId }) => ministryMembershipId,
      ),
    });
    const checkByMembershipId = new Map(
      checks.map((check) => [check.ministryMembershipId, check]),
    );
    const marksByCheckId = new Map(
      markCounts.map((row) => [
        row.availabilityCheckId,
        row.unavailableShiftCount,
      ]),
    );
    const shiftsByMembershipId = new Map(
      shiftTotals.map((row) => [row.ministryMembershipId, row.shiftCount]),
    );

    const statuses = memberships.flatMap<CheckStatusRow>(
      ({ ministryMembershipId, volunteerId, volunteerName }) => {
        const check = checkByMembershipId.get(ministryMembershipId);
        if (!check) return [];
        return {
          volunteerId: volunteerId as string,
          volunteerName,
          state: check.state,
          confirmedAt: check.confirmedAt,
          unavailableShiftCount: marksByCheckId.get(check.id) ?? 0,
          shiftCount: shiftsByMembershipId.get(ministryMembershipId) ?? 0,
        };
      },
    );

    const counts: Record<AnswerStatus, number> = {
      pending: 0,
      available: 0,
      unavailable: 0,
    };
    for (const row of statuses) counts[answerStatusOf(row)] += 1;
    const { statuses: page, nextCursor } = pageStatuses({
      statuses,
      status: input.status,
      q: input.q,
      cursor: input.cursor,
      limit: input.limit,
    });

    return {
      asked: statuses.length,
      confirmed: counts.available + counts.unavailable,
      answerBy,
      remindAvailableAt: this.remindAvailableAt({
        lastRemindedAt: askRecord?.lastRemindedAt ?? null,
      }),
      counts,
      statuses: page,
      nextCursor,
    };
  }

  /** Null unless a past Remind still holds the cooldown. */
  private remindAvailableAt({
    lastRemindedAt,
  }: RemindAvailableAtInput): Instant | null {
    if (!lastRemindedAt) return null;
    const availableAt = addMilliseconds({
      instant: lastRemindedAt,
      milliseconds: this.reminderCooldownMs,
    });
    const waitMs = millisecondsBetween({ start: now(), end: availableAt });
    return waitMs > 0 ? availableAt : null;
  }
}
