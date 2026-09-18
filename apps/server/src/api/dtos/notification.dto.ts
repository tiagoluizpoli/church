import { fromDate, instantSchema } from '@church/time';
import { z } from 'zod';
import type { NotificationListResult } from '../../domain/contracts/application/volunteer-manager';
import type { VolunteerNotification } from '../../domain/entities/volunteer-notification';

export const notificationResponseSchema = z.object({
  id: z.string(),
  volunteerId: z.string(),
  ministryId: z.string().optional(),
  eventId: z.string().optional(),
  assignmentId: z.string().optional(),
  type: z.enum([
    'schedule_published',
    'assignment_added',
    'assignment_changed',
    'assignment_removed',
    'availability_reminder',
    'availability_conflict',
    'assignment_reminder',
  ]),
  title: z.string(),
  body: z.string(),
  payload: z.record(z.string(), z.string().nullable()),
  readAt: instantSchema.optional(),
  createdAt: instantSchema,
});
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationResponseSchema),
  nextCursor: instantSchema.optional(),
});

function toResponse(n: VolunteerNotification): NotificationResponse {
  return {
    id: n.id as string,
    volunteerId: n.volunteerId as string,
    ministryId: n.ministryId as string | undefined,
    eventId: n.eventId as string | undefined,
    assignmentId: n.assignmentId as string | undefined,
    type: n.type,
    title: n.title,
    body: n.body,
    payload: n.payload as Record<string, string | null>,
    readAt: n.readAt,
    createdAt: fromDate({ date: n.createdAt }),
  };
}

export const notificationMapper = {
  toResponse,
  listToResponse(result: NotificationListResult) {
    return {
      items: result.items.map(toResponse),
      nextCursor: result.nextCursor
        ? fromDate({ date: result.nextCursor })
        : undefined,
    };
  },
};
