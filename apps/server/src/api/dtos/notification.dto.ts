import { z } from 'zod';
import type { NotificationListResult } from '../../domain/contracts/volunteer-manager';
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
    'assignment_reminder',
  ]),
  title: z.string(),
  body: z.string(),
  payload: z.record(z.string(), z.string().nullable()),
  readAt: z.string().optional(),
  createdAt: z.string(),
});
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationResponseSchema),
  nextCursor: z.string().optional(),
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
    readAt: n.readAt?.toISOString(),
    createdAt: n.createdAt.toISOString(),
  };
}

export const notificationMapper = {
  toResponse,
  listToResponse(result: NotificationListResult) {
    return {
      items: result.items.map(toResponse),
      nextCursor: result.nextCursor?.toISOString(),
    };
  },
};
