import { Entity } from '@church/core';
import { type Instant, now } from '@church/time';
import type {
  AssignmentId,
  ChurchId,
  SwapRequestId,
  UserId,
} from '../branded-ids';
import {
  SwapRequestNoteTooLongError,
  SwapRequestNotOpenError,
} from '../errors/swap-request';

export const SWAP_REQUEST_STATUS_OPTIONS = [
  'open',
  'covered',
  'kept',
  'withdrawn',
  'expired',
] as const;
export type SwapRequestStatus = (typeof SWAP_REQUEST_STATUS_OPTIONS)[number];
export type ClosedSwapRequestStatus = Exclude<SwapRequestStatus, 'open'>;

export interface SwapRequestProps {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  status: SwapRequestStatus;
  note?: string;
  reply?: string;
  raisedBy: UserId;
  raisedAt: Instant;
  closedBy?: UserId;
  closedAt?: Instant;
}

export interface SwapRequestInput {
  props: SwapRequestProps;
  id: SwapRequestId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RaiseSwapRequestInput {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  note?: string;
  raisedBy: UserId;
  /** From `appConfig.swapRequest.noteMaxLength`, passed by the use case. */
  noteMaxLength: number;
}

export interface CloseSwapRequestInput {
  status: ClosedSwapRequestStatus;
  closedBy?: UserId;
  reply?: string;
}

/** A Volunteer's ask that their leader change one Assignment; it never changes the Assignment itself. */
export class SwapRequest extends Entity<SwapRequestProps, SwapRequestId> {
  constructor({ props, id, createdAt, updatedAt }: SwapRequestInput) {
    super({ props, id, createdAt, updatedAt });
  }

  /** A new open request; the one-open-per-Assignment rule is enforced by the use case and the repository. */
  static raise({
    churchId,
    assignmentId,
    note,
    raisedBy,
    noteMaxLength,
  }: RaiseSwapRequestInput): SwapRequest {
    const trimmed = note?.trim() || undefined;
    if (trimmed && trimmed.length > noteMaxLength) {
      throw new SwapRequestNoteTooLongError({ maxLength: noteMaxLength });
    }
    return new SwapRequest({
      id: crypto.randomUUID() as SwapRequestId,
      props: {
        churchId,
        assignmentId,
        status: 'open',
        note: trimmed,
        raisedBy,
        raisedAt: now(),
      },
    });
  }

  /** Closes an open request; a closed one never reopens. */
  close({ status, closedBy, reply }: CloseSwapRequestInput): void {
    if (this._props.status !== 'open') throw new SwapRequestNotOpenError();
    this._props = {
      ...this._props,
      status,
      closedBy,
      reply,
      closedAt: now(),
    };
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get assignmentId(): AssignmentId {
    return this._props.assignmentId;
  }

  get status(): SwapRequestStatus {
    return this._props.status;
  }

  get note(): string | undefined {
    return this._props.note;
  }

  get reply(): string | undefined {
    return this._props.reply;
  }

  get raisedBy(): UserId {
    return this._props.raisedBy;
  }

  get raisedAt(): Instant {
    return this._props.raisedAt;
  }

  get closedBy(): UserId | undefined {
    return this._props.closedBy;
  }

  get closedAt(): Instant | undefined {
    return this._props.closedAt;
  }
}
