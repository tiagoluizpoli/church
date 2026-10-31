import { fromDate, instantSchema } from '@church/time';
import { z } from 'zod';
import type { MemberNotificationPage } from '../../domain/contracts/application/notification-manager';
import type { Notification } from '../../domain/entities/notification';
import { decodeNotificationCursor } from '../../domain/notification-cursor';
import {
  availabilityNotificationDataSchema,
  ministryInvitationNotificationDataSchema,
  schedulePublishedNotificationDataSchema,
} from '../../domain/notification-kinds';

/** One member Notification: typed kind/data and Instants, never rendered text. */
export const memberNotificationResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.uuid(),
    kind: z.literal('ministry_invitation'),
    data: ministryInvitationNotificationDataSchema,
    createdAt: instantSchema,
    readAt: instantSchema.optional(),
  }),
  z.object({
    id: z.uuid(),
    kind: z.literal('availability_opened'),
    data: availabilityNotificationDataSchema,
    createdAt: instantSchema,
    readAt: instantSchema.optional(),
  }),
  z.object({
    id: z.uuid(),
    kind: z.literal('availability_reminder'),
    data: availabilityNotificationDataSchema,
    createdAt: instantSchema,
    readAt: instantSchema.optional(),
  }),
  z.object({
    id: z.uuid(),
    kind: z.literal('schedule_published'),
    data: schedulePublishedNotificationDataSchema,
    createdAt: instantSchema,
    readAt: instantSchema.optional(),
  }),
]);
export type MemberNotificationResponse = z.infer<
  typeof memberNotificationResponseSchema
>;

export const memberNotificationListResponseSchema = z.object({
  items: z.array(memberNotificationResponseSchema),
  nextCursor: z.string().optional(),
  unreadCount: z.number().int().nonnegative(),
});

export const memberNotificationsQuerystringSchema = z.object({
  cursor: z
    .string()
    .refine((cursor) => decodeNotificationCursor({ cursor }) !== undefined, {
      message: 'Invalid cursor',
    })
    .optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const memberNotificationParamsSchema = z.object({
  notificationId: z.uuid(),
});

export const markedResponseSchema = z.object({ marked: z.literal(true) });

function toResponse(n: Notification): MemberNotificationResponse {
  return {
    id: n.id as string,
    ...n.payload,
    createdAt: fromDate({ date: n.createdAt }),
    readAt: n.readAt,
  };
}

export const memberNotificationMapper = {
  toResponse,
  listToResponse(page: MemberNotificationPage) {
    return {
      items: page.items.map(toResponse),
      nextCursor: page.nextCursor,
      unreadCount: page.unreadCount,
    };
  },
};
