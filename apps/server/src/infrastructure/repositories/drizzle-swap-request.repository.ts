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
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type {
  AssignmentId,
  CycleId,
  SwapRequestId,
} from '../../domain/branded-ids';
import type {
  CloseOpenSwapRequestInput,
  CreateSwapRequestInput,
  FindOpenSwapRequestInput,
  LeaderSwapRequestRow,
  ListLeaderSwapRequestsInput,
  SwapRequestRepository,
} from '../../domain/contracts/infrastructure/swap-request.repository';
import type { SwapRequest } from '../../domain/entities/swap-request';
import { SwapRequestAlreadyOpenError } from '../../domain/errors/swap-request';
import { mapSwapRequest } from '../mappers/swap-request.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';
import { isUniqueViolation } from './unique-violation';

const OPEN_INDEX = 'swap_request_open_assignment_idx';

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
      .orderBy(asc(shift.startTime), asc(swapRequest.raisedAt));
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

  async closeOpenByAssignment({
    churchId,
    assignmentId,
    status,
    closedBy,
    tx,
  }: CloseOpenSwapRequestInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .update(swapRequest)
      .set({
        status,
        closedBy: closedBy ?? null,
        closedAt: toDate({ instant: now() }),
      })
      .where(
        and(
          withChurchIsolation({ table: swapRequest, churchId }),
          eq(swapRequest.assignmentId, assignmentId),
          eq(swapRequest.status, 'open'),
        ),
      );
  }
}
