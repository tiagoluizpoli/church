import type { Notification } from '@/domain/entities/notification';
import type { NotificationPayload } from '@/domain/notification-kinds';

export type HideablePayload = Extract<
  NotificationPayload,
  { kind: 'event_cancelled' | 'event_changed' }
>;

export interface NoticeScopeInput {
  notification: Notification;
}

/** What an N9 or N10 notice is about; a block only when it is about one. */
export interface NoticeScope {
  eventId: string;
  eventTimeBlockId?: string;
}

/** The ids among a page's notices that are hidden right now. */
export interface HiddenScopes {
  eventIds: string[];
  eventTimeBlockIds: string[];
}

export interface WordedForHiddenChoiceInput {
  notification: Notification;
  hidden: HiddenScopes;
}
