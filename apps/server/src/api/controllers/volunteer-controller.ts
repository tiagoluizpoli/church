import 'reflect-metadata';
import { auth } from '@church/auth';
import { inject, injectable } from 'tsyringe';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { AssignmentId } from '../../domain/entities/assignment';
import type { AvailabilityId } from '../../domain/entities/availability';
import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import type { UserId, VolunteerId } from '../../domain/entities/volunteer';
import type { VolunteerNotificationId } from '../../domain/entities/volunteer-notification';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  notificationListResponseSchema,
  notificationMapper,
  notificationResponseSchema,
} from '../dtos/notification.dto';
import {
  assignmentListResponseSchema,
  assignmentResponseSchema,
  availabilityListResponseSchema,
  availabilityResponseSchema,
  dashboardResponseSchema,
  respondToAssignmentBodySchema,
  upsertAvailabilityBodySchema,
  volunteerMapper,
} from '../dtos/volunteer.dto';

@injectable()
export class VolunteerController implements FastifyController {
  readonly prefix = '/volunteer';

  constructor(
    @inject('IVolunteerManager')
    private readonly volunteerManager: IVolunteerManager,
  ) {}

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook('preValidation', async (request, reply) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value)
          headers.set(key, Array.isArray(value) ? (value[0] ?? '') : value);
      }

      const session = await auth.api.getSession({ headers }).catch(() => null);
      if (!session?.user) {
        return reply
          .status(401)
          .send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const ctx = await this.volunteerManager.resolveVolunteerContext(
        session.user.id as UserId,
      );
      if (!ctx) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'Volunteer profile not found',
        });
      }

      request.volunteerId = ctx.volunteerId as string;
      request.churchId = ctx.churchId as string;
    });

    app.get(
      '/dashboard',
      { schema: { response: { 200: dashboardResponseSchema } } },
      async (request, reply) => {
        const dashboard = await this.volunteerManager.getDashboard({
          volunteerId: request.volunteerId as VolunteerId,
          churchId: request.churchId as ChurchId,
        });
        return reply.send(volunteerMapper.dashboardToResponse(dashboard));
      },
    );

    app.get(
      '/assignments',
      { schema: { response: { 200: assignmentListResponseSchema } } },
      async (request, reply) => {
        const assignments = await this.volunteerManager.getUpcomingAssignments({
          volunteerId: request.volunteerId as VolunteerId,
          churchId: request.churchId as ChurchId,
        });
        return reply.send(volunteerMapper.assignmentsToResponse(assignments));
      },
    );

    app.get(
      '/ministries/:ministryId/schedule',
      { schema: { response: { 200: assignmentListResponseSchema } } },
      async (request, reply) => {
        const { ministryId } = request.params as { ministryId: string };
        const assignments = await this.volunteerManager.getMinistrySchedule({
          ministryId: ministryId as MinistryId,
          volunteerId: request.volunteerId as VolunteerId,
          churchId: request.churchId as ChurchId,
        });
        return reply.send(volunteerMapper.assignmentsToResponse(assignments));
      },
    );

    app.get(
      '/availability',
      { schema: { response: { 200: availabilityListResponseSchema } } },
      async (request, reply) => {
        const items = await this.volunteerManager.getAvailability({
          volunteerId: request.volunteerId as VolunteerId,
          churchId: request.churchId as ChurchId,
        });
        return reply.send(volunteerMapper.availabilityListToResponse(items));
      },
    );

    app.put(
      '/availability',
      {
        schema: {
          body: upsertAvailabilityBodySchema,
          response: { 200: availabilityResponseSchema },
        },
      },
      async (request, reply) => {
        const body = request.body as {
          availabilityId?: string;
          eventId?: string;
          type: 'available' | 'unavailable';
          startTime: string;
          endTime: string;
          isAllDay: boolean;
          reason?: string;
          repeatRule?: string;
        };
        const result = await this.volunteerManager.upsertAvailability({
          volunteerId: request.volunteerId as VolunteerId,
          churchId: request.churchId as ChurchId,
          availabilityId: body.availabilityId as AvailabilityId | undefined,
          eventId: body.eventId as
            | import('../../domain/entities/event').EventId
            | undefined,
          type: body.type,
          startTime: new Date(body.startTime),
          endTime: new Date(body.endTime),
          isAllDay: body.isAllDay,
          reason: body.reason,
          repeatRule: body.repeatRule,
        });
        return reply.send(volunteerMapper.availabilityToResponse(result));
      },
    );

    app.delete('/availability/:availabilityId', {}, async (request, reply) => {
      const { availabilityId } = request.params as { availabilityId: string };
      await this.volunteerManager.deleteAvailability({
        availabilityId: availabilityId as AvailabilityId,
        volunteerId: request.volunteerId as VolunteerId,
        churchId: request.churchId as ChurchId,
      });
      return reply.status(204).send();
    });

    app.patch(
      '/assignments/:assignmentId',
      {
        schema: {
          body: respondToAssignmentBodySchema,
          response: { 200: assignmentResponseSchema },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as { assignmentId: string };
        const body = request.body as {
          response: 'accepted' | 'declined';
          reason?: string;
        };
        const result = await this.volunteerManager.respondToAssignment({
          assignmentId: assignmentId as AssignmentId,
          volunteerId: request.volunteerId as VolunteerId,
          churchId: request.churchId as ChurchId,
          response: body.response,
          reason: body.reason,
        });
        return reply.send(volunteerMapper.assignmentToResponse(result));
      },
    );

    app.get(
      '/notifications',
      { schema: { response: { 200: notificationListResponseSchema } } },
      async (request, reply) => {
        const result = await this.volunteerManager.getNotifications({
          volunteerId: request.volunteerId as VolunteerId,
          churchId: request.churchId as ChurchId,
        });
        return reply.send(notificationMapper.listToResponse(result));
      },
    );

    app.patch(
      '/notifications/:notificationId',
      { schema: { response: { 200: notificationResponseSchema } } },
      async (request, reply) => {
        const { notificationId } = request.params as { notificationId: string };
        await this.volunteerManager.markNotificationRead({
          notificationId: notificationId as VolunteerNotificationId,
          volunteerId: request.volunteerId as VolunteerId,
          churchId: request.churchId as ChurchId,
        });
        return reply.status(200).send({ marked: true });
      },
    );

    app.post('/notifications/read-all', {}, async (request, reply) => {
      await this.volunteerManager.markAllNotificationsRead({
        volunteerId: request.volunteerId as VolunteerId,
        churchId: request.churchId as ChurchId,
      });
      return reply.status(201).send({ marked: true });
    });
  }
}
