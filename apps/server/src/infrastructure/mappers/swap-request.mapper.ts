import { fromDate } from '@church/time';
import type {
  AssignmentId,
  ChurchId,
  SwapRequestId,
  UserId,
} from '../../domain/branded-ids';
import {
  SwapRequest,
  type SwapRequestStatus,
} from '../../domain/entities/swap-request';
import type { MapSwapRequestInput } from './swap-request.mapper.types';

export function mapSwapRequest({ row }: MapSwapRequestInput): SwapRequest {
  return new SwapRequest({
    id: row.id as SwapRequestId,
    props: {
      churchId: row.churchId as ChurchId,
      assignmentId: row.assignmentId as AssignmentId,
      status: row.status as SwapRequestStatus,
      note: row.note ?? undefined,
      reply: row.reply ?? undefined,
      raisedBy: row.raisedBy as UserId,
      raisedAt: fromDate({ date: row.raisedAt }),
      closedBy: (row.closedBy ?? undefined) as UserId | undefined,
      closedAt: row.closedAt ? fromDate({ date: row.closedAt }) : undefined,
    },
    createdAt: row.raisedAt,
  });
}
