import { z } from 'zod';
import type {
  GetMinistrySchedule200,
  GetPublishedVolunteerSchedule200,
} from '@/infrastructure/api/churchAPI.schemas';

/** Runtime narrowing for stored copies of the reads; `satisfies` keeps them tied to the generated types. */
const assignmentSchema = z.object({
  assignmentId: z.string(),
  eventId: z.string(),
  eventTitle: z.string(),
  shiftId: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  ministryId: z.string(),
  ministryName: z.string(),
  sectorName: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  status: z.enum(['pending', 'confirmed', 'declined']),
});

const scheduleSummarySchema = z.object({
  ministryId: z.string(),
  ministryName: z.string(),
  cycleId: z.string(),
  cycleName: z.string(),
});

export type CachedMySchedule = GetPublishedVolunteerSchedule200 & {
  fetchedAt: string;
};

export const cachedMyScheduleSchema = z.object({
  assignments: z.array(assignmentSchema),
  schedules: z.array(scheduleSummarySchema),
  fetchedAt: z.string(),
}) satisfies z.ZodType<CachedMySchedule>;

const ministryRowSchema = z.object({
  shiftId: z.string(),
  shiftLabel: z.string(),
  shiftStart: z.string(),
  shiftEnd: z.string(),
  sectorName: z.string(),
  roleName: z.string(),
  volunteerDisplayName: z.string().optional(),
});

export const cachedMinistryScheduleSchema = z.object({
  ministryId: z.string(),
  ministryName: z.string(),
  cycleId: z.string(),
  cycleName: z.string(),
  published: z.boolean(),
  events: z.array(
    z.object({
      eventId: z.string(),
      title: z.string(),
      start: z.string(),
      end: z.string(),
      assignmentCount: z.number(),
      rows: z.array(ministryRowSchema),
    }),
  ),
}) satisfies z.ZodType<GetMinistrySchedule200>;
