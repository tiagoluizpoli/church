import {
  assignment,
  event,
  ministryParticipation,
  role,
  sector,
  shift,
  shiftRequirement,
  swapRequest,
  user,
  volunteer,
} from '@church/db';
import { fromDate, now, nowAsDate, toDate } from '@church/time';
import { and, asc, desc, eq, gt, inArray, type SQL } from 'drizzle-orm';
import type {
  AssignmentId,
  ChurchId,
  CycleId,
  SwapRequestId,
} from '../../domain/branded-ids';
import type {
  CloseOpenSwapRequestByIdInput,
  CloseOpenSwapRequestInput,
  CreateSwapRequestInput,
  FindOpenSwapRequestInput,
  FindSwapRequestByIdInput,
  LeaderSwapRequestRow,
  ListLeaderSwapRequestsInput,
  ListOpenAssignmentIdsInput,
  SwapRequestRepository,
} from '../../domain/contracts/infrastructure/swap-request.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { SwapRequest } from '../../domain/entities/swap-request';
import { SwapRequestAlreadyOpenError } from '../../domain/errors/swap-request';
import { mapSwapRequest } from '../mappers/swap-request.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';
import { isUniqueViolation } from './unique-violation';

const OPEN_INDEX = 'swap_request_open_assignment_idx';

interface CloseOpenWhereInput {
  churchId: ChurchId;
  match: SQL;
  values: Pick<
    typeof swapRequest.$inferInsert,
    'status' | 'closedBy' | 'reply'
  >;
  tx?: TransactionContext;
}

interface DrizzleSwapRequestRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleSwapRequestRepository implements SwapRequestRepository {
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleSwapRequestRepositoryInput) {
    this.db = db;
  }

  async create({ swapRequest: request, tx }: CreateSwapRequestInput) {
    try {
      await getClient({ db: this.db, tx })
        .insert(swapRequest)
        .values({
          id: request.id,
          churchId: request.churchId,
          assignmentId: request.assignmentId,
          status: request.status,
          note: request.note ?? null,
          raisedBy: request.raisedBy,
          raisedAt: toDate({ instant: request.raisedAt }),
        });
    } catch (error) {
      if (isUniqueViolation({ error, constraint: OPEN_INDEX })) {
        throw new SwapRequestAlreadyOpenError();
      }
      throw error;
    }
  }

  async listForLeader({
    churchId,
    ministryId,
    cycleId,
  }: ListLeaderSwapRequestsInput): Promise<LeaderSwapRequestRow[]> {
    const rows = await this.db
      .select({
        request: swapRequest,
        cycleId: event.cycleId,
        volunteerName: user.name,
        eventTitle: event.title,
        roleName: role.name,
        sectorName: sector.name,
        startsAt: shift.startTime,
        endsAt: shift.endTime,
      })
      .from(swapRequest)
      .innerJoin(assignment, eq(assignment.id, swapRequest.assignmentId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, assignment.participationId),
      )
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(
        shiftRequirement,
        eq(shiftRequirement.id, assignment.shiftRequirementId),
      )
      .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
      .innerJoin(role, eq(role.id, assignment.roleId))
      .innerJoin(volunteer, eq(volunteer.id, assignment.volunteerId))
      .innerJoin(user, eq(user.id, volunteer.userId))
      .where(
        and(
          withChurchIsolation({ table: swapRequest, churchId }),
          eq(ministryParticipation.ministryId, ministryId),
          cycleId ? eq(event.cycleId, cycleId) : undefined,
          inArray(swapRequest.status, ['open', 'expired']),
          // A request stays listed (as expired) only until its Shift ends.
          gt(shift.endTime, nowAsDate()),
        ),
      )
      .orderBy(
        asc(shift.startTime),
        asc(swapRequest.raisedAt),
        asc(swapRequest.id),
      );
    return rows.map(({ request, ...facts }) => ({
      id: request.id as SwapRequestId,
      assignmentId: request.assignmentId as AssignmentId,
      status: request.status as 'open' | 'expired',
      note: request.note ?? undefined,
      raisedAt: fromDate({ date: request.raisedAt }),
      cycleId: facts.cycleId as CycleId,
      volunteerName: facts.volunteerName,
      eventTitle: facts.eventTitle,
      roleName: facts.roleName,
      sectorName: facts.sectorName,
      startsAt: fromDate({ date: facts.startsAt }),
      endsAt: fromDate({ date: facts.endsAt }),
    }));
  }

  async findOpenByAssignment({
    churchId,
    assignmentId,
    tx,
  }: FindOpenSwapRequestInput): Promise<SwapRequest | null> {
    const [row] = await getClient({ db: this.db, tx })
      .select()
      .from(swapRequest)
      .where(
        and(
          withChurchIsolation({ table: swapRequest, churchId }),
          eq(swapRequest.assignmentId, assignmentId),
          eq(swapRequest.status, 'open'),
        ),
      );
    return row ? mapSwapRequest({ row }) : null;
  }

  async findById({
    churchId,
    swapRequestId,
    tx,
  }: FindSwapRequestByIdInput): Promise<SwapRequest | null> {
    const [row] = await getClient({ db: this.db, tx })
      .select()
      .from(swapRequest)
      .where(
        and(
          withChurchIsolation({ table: swapRequest, churchId }),
          eq(swapRequest.id, swapRequestId),
        ),
      );
    return row ? mapSwapRequest({ row }) : null;
  }

  async closeOpenById({
    churchId,
    swapRequestId,
    status,
    closedBy,
    reply,
    tx,
  }: CloseOpenSwapRequestByIdInput): Promise<boolean> {
    return this.closeOpenWhere({
      churchId,
      match: eq(swapRequest.id, swapRequestId),
      values: { status, closedBy, reply: reply ?? null },
      tx,
    });
  }

  async findLatestByAssignment({
    churchId,
    assignmentId,
    tx,
  }: FindOpenSwapRequestInput): Promise<SwapRequest | null> {
    const [row] = await getClient({ db: this.db, tx })
      .select()
      .from(swapRequest)
      .where(
        and(
          withChurchIsolation({ table: swapRequest, churchId }),
          eq(swapRequest.assignmentId, assignmentId),
        ),
      )
      .orderBy(desc(swapRequest.raisedAt), desc(swapRequest.id))
      .limit(1);
    return row ? mapSwapRequest({ row }) : null;
  }

  async listOpenAssignmentIds({
    churchId,
    assignmentIds,
  }: ListOpenAssignmentIdsInput) {
    if (assignmentIds.length === 0) return [];
    const rows = await getClient({ db: this.db })
      .select({ assignmentId: swapRequest.assignmentId })
      .from(swapRequest)
      .where(
        and(
          withChurchIsolation({ table: swapRequest, churchId }),
          inArray(swapRequest.assignmentId, assignmentIds),
          eq(swapRequest.status, 'open'),
        ),
      );
    return rows.map((row) => row.assignmentId as AssignmentId);
  }

  async closeOpenByAssignment({
    churchId,
    assignmentId,
    status,
    closedBy,
    tx,
  }: CloseOpenSwapRequestInput): Promise<boolean> {
    return this.closeOpenWhere({
      churchId,
      match: eq(swapRequest.assignmentId, assignmentId),
      values: { status, closedBy: closedBy ?? null },
      tx,
    });
  }

  /** The one conditional close: only a still-`open` match transitions, so a concurrent close wins once. */
  private async closeOpenWhere({
    churchId,
    match,
    values,
    tx,
  }: CloseOpenWhereInput): Promise<boolean> {
    const closed = await getClient({ db: this.db, tx })
      .update(swapRequest)
      .set({ ...values, closedAt: toDate({ instant: now() }) })
      .where(
        and(
          withChurchIsolation({ table: swapRequest, churchId }),
          match,
          eq(swapRequest.status, 'open'),
        ),
      )
      .returning({ id: swapRequest.id });
    return closed.length > 0;
  }
}
