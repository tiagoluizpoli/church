import { Entity, type LooseProps } from '@church/core';
import type { Instant } from '@church/time';
import type { ChurchId, NotificationId, UserId } from '../branded-ids';
import type { NotificationPayload } from '../notification-kinds';

/** A member's own inbox: always both halves of the owner, never one alone. */
export interface NotificationOwner {
  userId: UserId;
  churchId: ChurchId;
}

export interface NotificationPage {
  items: Notification[];
  /** Opaque cursor for the next page; absent on the last one. */
  nextCursor?: string;
}

export type NotificationProps = {
  userId: UserId;
  churchId: ChurchId;
  /** The outbox row this Notification was delivered from; unique, so a replay is idempotent. */
  sourceOutboxId: string;
  readAt?: Instant;
} & NotificationPayload;

export interface NotificationInput {
  props: LooseProps<NotificationProps>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Notification extends Entity<NotificationProps, NotificationId> {
  constructor({ props, id, createdAt, updatedAt }: NotificationInput) {
    super({
      props: props as NotificationProps,
      id: id as NotificationId,
      createdAt,
      updatedAt,
    });
  }

  get userId(): UserId {
    return this._props.userId;
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get sourceOutboxId(): string {
    return this._props.sourceOutboxId;
  }

  get readAt(): Instant | undefined {
    return this._props.readAt;
  }

  get payload(): NotificationPayload {
    return {
      kind: this._props.kind,
      data: this._props.data,
    } as NotificationPayload;
  }
}
