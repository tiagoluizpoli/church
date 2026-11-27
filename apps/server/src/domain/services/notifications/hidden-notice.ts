import type {
  HideablePayload,
  NoticeScope,
  NoticeScopeInput,
  WordedForHiddenChoiceInput,
} from './hidden-notice.types';
import { Notification } from '@/domain/entities/notification';
import type { NotificationPayload } from '@/domain/notification-kinds';

/** N9 and N10 are the notices that follow the hidden choice. */
function isHideable(payload: NotificationPayload): payload is HideablePayload {
  return payload.kind === 'event_cancelled' || payload.kind === 'event_changed';
}

export function noticeScope({
  notification,
}: NoticeScopeInput): NoticeScope | null {
  const { payload } = notification;
  return isHideable(payload) ? payload.data : null;
}

/** The data without any of the Event's titles. */
function anonymised(payload: HideablePayload): HideablePayload {
  const blank = { eventTitle: '', hidden: true };
  if (payload.kind === 'event_changed') {
    return { kind: payload.kind, data: { ...payload.data, ...blank } };
  }
  const shifts = payload.data.shifts.map((shift) => ({
    ...shift,
    eventTitle: '',
  }));
  return { kind: payload.kind, data: { ...payload.data, ...blank, shifts } };
}

/**
 * A stored notice as it reads now: anonymised while its Event, or the block it
 * is about, is hidden, with the title otherwise. A stored `hidden` only says
 * how its email was queued, so it is dropped.
 */
export function wordedForHiddenChoice({
  notification,
  hidden,
}: WordedForHiddenChoiceInput): Notification {
  const { payload, id, userId, churchId, sourceOutboxId, readAt } =
    notification;
  if (!isHideable(payload)) return notification;
  const { eventId, eventTimeBlockId = '' } = payload.data;
  const isHidden =
    hidden.eventIds.includes(eventId) ||
    hidden.eventTimeBlockIds.includes(eventTimeBlockId);
  const { hidden: _queuedHidden, ...data } = payload.data;
  const stored = { kind: payload.kind, data } as HideablePayload;
  const worded = isHidden ? anonymised(stored) : stored;
  return new Notification({
    props: { ...worded, userId, churchId, sourceOutboxId, readAt },
    id,
    createdAt: notification.createdAt,
  });
}
