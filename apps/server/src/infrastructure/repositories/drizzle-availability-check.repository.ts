import { NotFoundError } from '@church/core';
import {
  availabilityAsk,
  availabilityCheck,
  church,
  cycle,
  event,
  eventTimeBlock,
  ministry,
  ministryMembership,
  ministryMembershipRole,
  ministryParticipation,
  role,
  shift,
  shiftRequirement,
  unavailableShift,
  user,
  volunteer,
} from '@church/db';
import { fromDate } from '@church/time';
import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  exists,
  inArray,
  isNull,
  ne,
  not,
  type SQL,
} from 'drizzle-orm';
import type { PgSelect } from 'drizzle-orm/pg-core';
import type {
  AvailabilityCheckId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  RoleId,
  ShiftId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type {
  ActiveMinistryMembership,
  AskRecordRow,
  AvailabilityCheckRepository,
  CheckContext,
  CheckMarkCountRow,
  CheckShiftRow,
  ConfirmCheckInput,
  CreateAskRecordInput,
  CreateChecksInput,
  GetCheckContextInput,
  ListActiveMembershipsInput,
  ListCheckShiftsInput,
  ListChecksByCycleInput,
  ListChecksByVolunteerInput,
  ListMinistryLeaderVolunteerIdsInput,
  MinistryLeaderRow,
  RelevantShiftTotalRow,
  RoleWithoutHolderRow,
  ScheduleScopeInput,
  ServedShiftRow,
  StampRemindedInput,
} from '../../domain/contracts/infrastructure/availability-check.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { AvailabilityCheck } from '../../domain/entities/availability-check';
import { mapAvailabilityCheck } from '../mappers/availability-check.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleAvailabilityCheckRepositoryInput {
  db: AnyDrizzleDb;
}

/** A check that can still be answered: not withdrawn, on an active Ministry Membership (joined by the caller). */
export const actionable = () =>
  and(
    isNull(availabilityCheck.withdrawnAt),
    eq(ministryMembership.status, 'active'),
  );

interface SelectActiveMembershipsInput extends ListActiveMembershipsInput {
  filter?: SQL;
}

interface ShareLockMembershipsInput<Query extends PgSelect> {
  query: Query;
  tx?: TransactionContext;
}

/** In a transaction, waits out a concurrent removal and re-reads the membership after it. */
function shareLockMembershipsInTx<Query extends PgSelect>({
  query,
  tx,
}: ShareLockMembershipsInput<Query>) {
  return tx ? query.for('share', { of: ministryMembership }) : query;
}

export class DrizzleAvailabilityCheckRepository
  implements AvailabilityCheckRepository
{
  constructor({ db }: DrizzleAvailabilityCheckRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  /** Each ShiftRequirement of a Shift the Ministry serves in the Cycle. */
  private servedRequirements({
    churchId,
    ministryId,
    cycleId,
    tx,
  }: ScheduleScopeInput) {
    return getClient({ db: this.db, tx })
      .select({
        shiftId: shiftRequirement.shiftId,
        roleId: shiftRequirement.roleId,
      })
      .from(shiftRequirement)
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shiftRequirement.participationId),
      )
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .where(
        and(
          withChurchIsolation({ table: shiftRequirement, churchId }),
          eq(ministryParticipation.ministryId, ministryId),
          eq(event.cycleId, cycleId),
          ne(event.status, 'cancelled'),
        ),
      )
      .as('served_requirement');
  }

  async listEligibleMemberships(
    input: ScheduleScopeInput,
  ): Promise<ActiveMinistryMembership[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const served = this.servedRequirements(input);
    const holdsNeededRole = exists(
      db
        .select({ roleId: served.roleId })
        .from(ministryMembershipRole)
        .innerJoin(served, eq(served.roleId, ministryMembershipRole.roleId))
        .where(
          eq(
            ministryMembershipRole.ministryMembershipId,
            ministryMembership.id,
          ),
        ),
    );

    return this.selectActiveMemberships({ ...input, filter: holdsNeededRole });
  }

  async createAskRecord({
    churchId,
    ministryId,
    cycleId,
    askedAt,
    tx,
  }: CreateAskRecordInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .insert(availabilityAsk)
      .values({ churchId, ministryId, cycleId, askedAt });
  }

  /** One Schedule's ask record, by its unique key. */
  private askRecordOf({ churchId, ministryId, cycleId }: ScheduleScopeInput) {
    return and(
      withChurchIsolation({ table: availabilityAsk, churchId }),
      eq(availabilityAsk.ministryId, ministryId),
      eq(availabilityAsk.cycleId, cycleId),
    );
  }

  async findAskRecord(input: ScheduleScopeInput): Promise<AskRecordRow | null> {
    const [row] = await getClient({ db: this.db, tx: input.tx })
      .select({ lastRemindedAt: availabilityAsk.lastRemindedAt })
      .from(availabilityAsk)
      .where(this.askRecordOf(input));
    if (!row) return null;

    const { lastRemindedAt } = row;
    return {
      lastRemindedAt: lastRemindedAt && fromDate({ date: lastRemindedAt }),
    };
  }

  async stampReminded({
    remindedAt,
    ...scope
  }: StampRemindedInput): Promise<void> {
    await getClient({ db: this.db, tx: scope.tx })
      .update(availabilityAsk)
      .set({ lastRemindedAt: remindedAt })
      .where(this.askRecordOf(scope));
  }

  async listCheckMarkCounts({
    churchId,
    ministryId,
    cycleId,
    tx,
  }: ScheduleScopeInput): Promise<CheckMarkCountRow[]> {
    const served = this.servedRequirements({
      churchId,
      ministryId,
      cycleId,
      tx,
    });
    const rows = await getClient({ db: this.db, tx })
      .select({
        availabilityCheckId: availabilityCheck.id,
        unavailableShiftCount: countDistinct(unavailableShift.shiftId),
      })
      .from(availabilityCheck)
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .leftJoin(
        ministryMembershipRole,
        eq(ministryMembershipRole.ministryMembershipId, ministryMembership.id),
      )
      .leftJoin(served, eq(served.roleId, ministryMembershipRole.roleId))
      .leftJoin(
        unavailableShift,
        and(
          eq(unavailableShift.availabilityCheckId, availabilityCheck.id),
          eq(unavailableShift.shiftId, served.shiftId),
        ),
      )
      .where(
        and(
          withChurchIsolation({ table: availabilityCheck, churchId }),
          eq(availabilityCheck.cycleId, cycleId),
          eq(ministryMembership.ministryId, ministryId),
          isNull(availabilityCheck.withdrawnAt),
        ),
      )
      .groupBy(availabilityCheck.id);

    return rows.map((row) => ({
      availabilityCheckId: row.availabilityCheckId as AvailabilityCheckId,
      unavailableShiftCount: row.unavailableShiftCount,
    }));
  }

  async listRelevantShiftTotals({
    churchId,
    ministryId,
    cycleId,
    tx,
  }: ScheduleScopeInput): Promise<RelevantShiftTotalRow[]> {
    const served = this.servedRequirements({
      churchId,
      ministryId,
      cycleId,
      tx,
    });

    return getClient({ db: this.db, tx })
      .select({
        ministryMembershipId: ministryMembership.id,
        shiftCount: countDistinct(served.shiftId),
      })
      .from(ministryMembership)
      .leftJoin(
        ministryMembershipRole,
        eq(ministryMembershipRole.ministryMembershipId, ministryMembership.id),
      )
      .leftJoin(served, eq(served.roleId, ministryMembershipRole.roleId))
      .where(
        and(
          withChurchIsolation({ table: ministryMembership, churchId }),
          eq(ministryMembership.ministryId, ministryId),
          eq(ministryMembership.status, 'active'),
        ),
      )
      .groupBy(ministryMembership.id);
  }

  async listServedShifts({
    churchId,
    ministryId,
    cycleId,
    tx,
  }: ScheduleScopeInput): Promise<ServedShiftRow[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({
        eventId: event.id,
        eventTimeBlockId: eventTimeBlock.id,
        eventTimeBlockStartsAt: eventTimeBlock.startTime,
        requirementCount: count(shiftRequirement.id),
      })
      .from(shift)
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, shift.participationId),
      )
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .leftJoin(shiftRequirement, eq(shiftRequirement.shiftId, shift.id))
      .where(
        and(
          withChurchIsolation({ table: shift, churchId }),
          eq(ministryParticipation.ministryId, ministryId),
          eq(event.cycleId, cycleId),
          ne(event.status, 'cancelled'),
        ),
      )
      .groupBy(shift.id, event.id, eventTimeBlock.id)
      .orderBy(asc(eventTimeBlock.startTime));

    return rows.map((row) => ({
      eventId: row.eventId as EventId,
      eventTimeBlockId: row.eventTimeBlockId as EventTimeBlockId,
      eventTimeBlockStartsAt: fromDate({ date: row.eventTimeBlockStartsAt }),
      flagged: row.requirementCount === 0,
    }));
  }

  async listRolesWithoutHolders(
    input: ScheduleScopeInput,
  ): Promise<RoleWithoutHolderRow[]> {
    const { churchId, ministryId, tx } = input;
    const db = getClient({ db: this.db, tx });
    const served = this.servedRequirements(input);
    const held = exists(
      db
        .select({ roleId: ministryMembershipRole.roleId })
        .from(ministryMembershipRole)
        .innerJoin(
          ministryMembership,
          eq(
            ministryMembership.id,
            ministryMembershipRole.ministryMembershipId,
          ),
        )
        .where(
          and(
            eq(ministryMembershipRole.roleId, role.id),
            withChurchIsolation({ table: ministryMembership, churchId }),
            eq(ministryMembership.ministryId, ministryId),
            eq(ministryMembership.status, 'active'),
          ),
        ),
    );
    const rows = await db
      .select({
        roleId: role.id,
        roleName: role.name,
        shiftCount: countDistinct(served.shiftId),
      })
      .from(served)
      .innerJoin(role, eq(role.id, served.roleId))
      .where(not(held))
      .groupBy(role.id)
      .orderBy(asc(role.name));

    return rows.map((row) => ({ ...row, roleId: row.roleId as RoleId }));
  }

  listActiveMemberships(
    input: ListActiveMembershipsInput,
  ): Promise<ActiveMinistryMembership[]> {
    return this.selectActiveMemberships(input);
  }

  private async selectActiveMemberships({
    churchId,
    ministryId,
    tx,
    filter,
  }: SelectActiveMembershipsInput): Promise<ActiveMinistryMembership[]> {
    const db = getClient({ db: this.db, tx });
    const query = db
      .select({
        ministryMembershipId: ministryMembership.id,
        volunteerId: ministryMembership.volunteerId,
        userId: volunteer.userId,
        volunteerName: user.name,
      })
      .from(ministryMembership)
      .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(
        and(
          eq(ministryMembership.ministryId, ministryId),
          eq(ministryMembership.status, 'active'),
          withChurchIsolation({ table: ministryMembership, churchId }),
          filter,
        ),
      )
      .$dynamic();
    // Ask waits out a concurrent removal.
    const rows = await shareLockMembershipsInTx({ query, tx });

    return rows.map((row) => ({
      ministryMembershipId: row.ministryMembershipId,
      volunteerId: row.volunteerId as VolunteerId,
      userId: row.userId as UserId,
      volunteerName: row.volunteerName,
    }));
  }

  async listByCycle(
    input: ListChecksByCycleInput,
  ): Promise<AvailabilityCheck[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const conditions = [
      eq(availabilityCheck.cycleId, input.cycleId),
      isNull(availabilityCheck.withdrawnAt),
      withChurchIsolation({
        table: availabilityCheck,
        churchId: input.churchId,
      }),
    ];

    if (input.ministryMembershipIds && input.ministryMembershipIds.length > 0) {
      conditions.push(
        inArray(
          availabilityCheck.ministryMembershipId,
          input.ministryMembershipIds,
        ),
      );
    }

    const rows = await db
      .select()
      .from(availabilityCheck)
      .where(and(...conditions));

    return rows.map(mapAvailabilityCheck);
  }

  async createMany(input: CreateChecksInput): Promise<AvailabilityCheck[]> {
    if (input.checks.length === 0) {
      return [];
    }

    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .insert(availabilityCheck)
      .values(
        input.checks.map((check) => ({
          churchId: input.churchId,
          cycleId: check.cycleId,
          ministryMembershipId: check.ministryMembershipId,
        })),
      )
      .onConflictDoNothing()
      .returning();

    return rows.map(mapAvailabilityCheck);
  }

  private contextSelection() {
    return {
      check: availabilityCheck,
      volunteerId: ministryMembership.volunteerId,
      ministryId: ministryMembership.ministryId,
      ministryName: ministry.name,
      cycleName: cycle.name,
      timeZone: church.timezone,
    };
  }

  async getCheckContext(input: GetCheckContextInput): Promise<CheckContext> {
    const db = getClient({ db: this.db, tx: input.tx });
    const query = db
      .select(this.contextSelection())
      .from(availabilityCheck)
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
      .innerJoin(cycle, eq(cycle.id, availabilityCheck.cycleId))
      .innerJoin(church, eq(church.id, availabilityCheck.churchId))
      .where(
        and(
          eq(availabilityCheck.id, input.checkId),
          actionable(),
          withChurchIsolation({
            table: availabilityCheck,
            churchId: input.churchId,
          }),
        ),
      )
      .$dynamic();
    // An answer waits out a concurrent removal.
    const rows = await shareLockMembershipsInTx({ query, tx: input.tx });

    const row = rows[0];
    if (!row) {
      throw new NotFoundError(`Availability check not found: ${input.checkId}`);
    }

    return {
      check: mapAvailabilityCheck(row.check),
      volunteerId: row.volunteerId as VolunteerId,
      ministryId: row.ministryId as MinistryId,
      ministryName: row.ministryName,
      cycleName: row.cycleName,
      timeZone: row.timeZone,
    };
  }

  async listByVolunteer(
    input: ListChecksByVolunteerInput,
  ): Promise<CheckContext[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select(this.contextSelection())
      .from(availabilityCheck)
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
      .innerJoin(cycle, eq(cycle.id, availabilityCheck.cycleId))
      .innerJoin(church, eq(church.id, availabilityCheck.churchId))
      .where(
        and(
          eq(ministryMembership.volunteerId, input.volunteerId),
          actionable(),
          withChurchIsolation({
            table: availabilityCheck,
            churchId: input.churchId,
          }),
        ),
      );

    return rows.map((row) => ({
      check: mapAvailabilityCheck(row.check),
      volunteerId: row.volunteerId as VolunteerId,
      ministryId: row.ministryId as MinistryId,
      ministryName: row.ministryName,
      cycleName: row.cycleName,
      timeZone: row.timeZone,
    }));
  }

  async listCheckShifts(input: ListCheckShiftsInput): Promise<CheckShiftRow[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select({
        shiftId: shift.id,
        eventId: event.id,
        eventTitle: event.title,
        startTime: shift.startTime,
        endTime: shift.endTime,
        label: shift.label,
      })
      .from(availabilityCheck)
      .innerJoin(
        ministryMembership,
        eq(ministryMembership.id, availabilityCheck.ministryMembershipId),
      )
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.ministryId, ministryMembership.ministryId),
      )
      .innerJoin(
        event,
        and(
          eq(event.id, ministryParticipation.eventId),
          eq(event.cycleId, availabilityCheck.cycleId),
        ),
      )
      .innerJoin(shift, eq(shift.participationId, ministryParticipation.id))
      .where(
        and(
          eq(availabilityCheck.id, input.checkId),
          withChurchIsolation({
            table: availabilityCheck,
            churchId: input.churchId,
          }),
        ),
      )
      .orderBy(shift.startTime);

    return rows.map((row) => ({
      shiftId: row.shiftId as ShiftId,
      eventId: row.eventId as EventId,
      eventTitle: row.eventTitle,
      startTime: fromDate({ date: row.startTime }),
      endTime: fromDate({ date: row.endTime }),
      label: row.label ?? undefined,
    }));
  }

  async listMinistryLeaderVolunteerIds(
    input: ListMinistryLeaderVolunteerIdsInput,
  ): Promise<MinistryLeaderRow[]> {
    if (input.ministryIds.length === 0) return [];

    const db = getClient({ db: this.db, tx: input.tx });
    const rows = await db
      .select({
        ministryId: ministryMembership.ministryId,
        volunteerId: ministryMembership.volunteerId,
      })
      .from(ministryMembership)
      .where(
        and(
          inArray(ministryMembership.ministryId, input.ministryIds),
          eq(ministryMembership.ministryAccessLevel, 'leader'),
          eq(ministryMembership.status, 'active'),
          withChurchIsolation({
            table: ministryMembership,
            churchId: input.churchId,
          }),
        ),
      );

    return rows.map((row) => ({
      ministryId: row.ministryId as MinistryId,
      volunteerId: row.volunteerId as VolunteerId,
    }));
  }

  async confirm(input: ConfirmCheckInput): Promise<void> {
    const db = getClient({ db: this.db, tx: input.tx });
    await db
      .update(availabilityCheck)
      .set({ state: 'confirmed', confirmedAt: input.confirmedAt })
      .where(
        and(
          eq(availabilityCheck.id, input.checkId),
          isNull(availabilityCheck.withdrawnAt),
          withChurchIsolation({
            table: availabilityCheck,
            churchId: input.churchId,
          }),
        ),
      );
  }
}
