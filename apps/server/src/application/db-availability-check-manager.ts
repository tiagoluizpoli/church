import type { AppConfig } from '@church/app-config';
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
import type {
  AskPreview,
  AskScheduleInput,
  AskScheduleResult,
  CheckStatusRow,
  CycleCheckStatuses,
  GetAskPreviewInput,
  IAvailabilityCheckManager,
  ListCycleCheckStatusesInput,
  RemindScheduleInput,
  RemindScheduleResult,
  SetDeadlineInput,
} from '../domain/contracts/application/availability-check-manager';
import type { IChurchNotifications } from '../domain/contracts/application/church-notifications';
import type {
  ActiveMinistryMembership,
  AvailabilityCheckRepository,
  ScheduleScopeInput,
  ServedShiftRow,
} from '../domain/contracts/infrastructure/availability-check.repository';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { Cycle } from '../domain/entities/cycle';
import { deriveScheduleStage } from '../domain/entities/ministry-participation';
import { IllegalStateTransitionError } from '../domain/errors';
import {
  AskBlockedFlaggedShiftsError,
  type FlaggedBlock,
} from '../domain/errors/ask-blocked-flagged-shifts';
import { AskNoEligibleVolunteersError } from '../domain/errors/ask-no-eligible-volunteers';
import { RemindOnCooldownError } from '../domain/errors/remind-on-cooldown';

interface DbAvailabilityCheckManagerDependencies {
  participationRepository: MinistryParticipationRepository;
  availabilityCheckRepository: AvailabilityCheckRepository;
  cycleRepository: CycleRepository;
  ministryRepository: MinistryRepository;
  churchRepository: ChurchRepository;
  notifications: IChurchNotifications;
  unitOfWork: UnitOfWork;
  config: AppConfig;
}

interface RemindAvailableAtInput {
  lastRemindedAt: Instant | null;
}

interface EnsureCycleAskableInput {
  cycle: Cycle;
  timeZone: string;
  transition: string;
}

interface LockUnpublishedScheduleInput extends ScheduleScopeInput {
  tx: TransactionContext;
  timeZone: string;
  transition: string;
}

interface OpenChecksInput extends ScheduleScopeInput {
  tx: TransactionContext;
  eligible: ActiveMinistryMembership[];
}

interface OpenChecksResult {
  createdCheckCount: number;
  notifiedVolunteerCount: number;
}

const ASK_TRANSITION = 'ask_availability';
const DEADLINE_TRANSITION = 'set_deadline';
const REMIND_TRANSITION = 'remind';

interface FlaggedBlocksOfInput {
  servedShifts: ServedShiftRow[];
}

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
      const notConfirmedMembershipIds = new Set(
        checks
          .filter(({ state }) => state === 'pending')
          .map(({ ministryMembershipId }) => ministryMembershipId),
      );
      const notConfirmed = memberships.filter(({ ministryMembershipId }) =>
        notConfirmedMembershipIds.has(ministryMembershipId),
      );
      const eligible =
        await this.availabilityCheckRepository.listEligibleMemberships(scope);

      const { createdCheckCount } = await this.openChecks({
        ...scope,
        eligible,
      });
      await this.notifications.enqueue({
        tx,
        kind: 'availability_reminder',
        to: notConfirmed.map(({ userId }) => ({ userId, churchId })),
        data: { cycleId: cycleId as string, ministryId: ministryId as string },
      });
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

    const participations =
      await this.participationRepository.lockSchedule(scope);
    const servingStates = participations.map(({ state }) => state);
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
    const createdMembershipIds = new Set(
      created.map((check) => check.ministryMembershipId),
    );
    const opened = eligible.filter(({ ministryMembershipId }) =>
      createdMembershipIds.has(ministryMembershipId),
    );
    await this.notifications.enqueue({
      tx,
      kind: 'availability_opened',
      to: opened.map(({ userId }) => ({ userId, churchId })),
      data: { cycleId: cycleId as string, ministryId: ministryId as string },
    });
    return {
      createdCheckCount: created.length,
      notifiedVolunteerCount: opened.length,
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

    return {
      asked: statuses.length,
      confirmed: statuses.filter(({ state }) => state === 'confirmed').length,
      answerBy,
      remindAvailableAt: this.remindAvailableAt({
        lastRemindedAt: askRecord?.lastRemindedAt ?? null,
      }),
      statuses,
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
