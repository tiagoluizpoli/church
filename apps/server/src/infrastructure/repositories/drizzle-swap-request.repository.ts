import { swapRequest } from '@church/db';
import { now, toDate } from '@church/time';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AssignmentId } from '../../domain/branded-ids';
import type {
  CloseOpenSwapRequestInput,
  CreateSwapRequestInput,
  FindOpenSwapRequestInput,
  ListOpenAssignmentIdsInput,
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
      .orderBy(desc(swapRequest.raisedAt))
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
