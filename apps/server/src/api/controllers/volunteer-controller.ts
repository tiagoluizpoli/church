import 'reflect-metadata';
import { auth } from '@church/auth';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import { AssignmentId } from '../../domain/entities/assignment';
import { AvailabilityId } from '../../domain/entities/availability';
import { ChurchId } from '../../domain/entities/church';
import { EventId } from '../../domain/entities/event';
import { MinistryId } from '../../domain/entities/ministry';
import { UserId, VolunteerId } from '../../domain/entities/volunteer';
import { VolunteerNotificationId } from '../../domain/entities/volunteer-notification';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  notificationListResponseSchema,
  notificationMapper,
} from '../dtos/notification.dto';
import {
  assignmentListResponseSchema,
  assignmentResponseSchema,
  availabilityListResponseSchema,
  availabilityResponseSchema,
  dashboardResponseSchema,
  ministryScheduleResponseSchema,
  respondToAssignmentBodySchema,
  upsertAvailabilityBodySchema,
  volunteerMapper,
} from '../dtos/volunteer.dto';
import { headersFromRequest } from '../utils/headers';

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
      const headers = headersFromRequest(request);
      const session = await auth.api.getSession({ headers }).catch(() => null);
      if (!session?.user) {
        return reply
          .status(401)
          .send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const ctx = await this.volunteerManager.resolveVolunteerContext(
        UserId.from(session.user.id),
      );
      if (!ctx) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'Volunteer profile not found',
        });
      }

      request.volunteerId = ctx.volunteerId;
      request.churchId = ctx.churchId;
    });

    app.get(
      '/dashboard',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getVolunteerDashboard',
          response: { 200: dashboardResponseSchema },
        },
      },
      async (request, reply) => {
        const dashboard = await this.volunteerManager.getDashboard({
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(volunteerMapper.dashboardToResponse(dashboard));
      },
    );

    app.get(
      '/assignments',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getMyAssignments',
          response: { 200: assignmentListResponseSchema },
        },
      },
      async (request, reply) => {
        const assignments = await this.volunteerManager.getUpcomingAssignments({
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(volunteerMapper.assignmentsToResponse(assignments));
      },
    );

    app.get(
      '/ministries/:ministryId/schedule',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getMinistrySchedule',
          response: { 200: ministryScheduleResponseSchema },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params as { ministryId: string };
        const schedule = await this.volunteerManager.getMinistrySchedule({
          ministryId: MinistryId.from(ministryId),
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(volunteerMapper.ministryScheduleToResponse(schedule));
      },
    );

    app.get(
      '/availability',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getMyAvailability',
          response: { 200: availabilityListResponseSchema },
        },
      },
      async (request, reply) => {
        const items = await this.volunteerManager.getAvailability({
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(volunteerMapper.availabilityListToResponse(items));
      },
    );

    app.put(
      '/availability',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'upsertAvailability',
          body: upsertAvailabilityBodySchema,
          response: { 200: availabilityResponseSchema },
        },
      },
      async (request, reply) => {
        const body = request.body as z.infer<
          typeof upsertAvailabilityBodySchema
        >;
        const result = await this.volunteerManager.upsertAvailability({
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
          availabilityId: body.availabilityId
            ? AvailabilityId.from(body.availabilityId)
            : undefined,
          eventId: body.eventId ? EventId.from(body.eventId) : undefined,
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

    app.delete(
      '/availability/:availabilityId',
      { schema: { tags: ['volunteer'], operationId: 'deleteAvailability' } },
      async (request, reply) => {
        const { availabilityId } = request.params as { availabilityId: string };
        await this.volunteerManager.deleteAvailability({
          availabilityId: AvailabilityId.from(availabilityId),
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(204).send();
      },
    );

    app.patch(
      '/assignments/:assignmentId',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'respondToAssignment',
          body: respondToAssignmentBodySchema,
          response: { 200: assignmentResponseSchema },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as { assignmentId: string };
        const body = request.body as z.infer<
          typeof respondToAssignmentBodySchema
        >;
        const result = await this.volunteerManager.respondToAssignment({
          assignmentId: AssignmentId.from(assignmentId),
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
          response: body.response,
          reason: body.reason,
        });
        return reply.send(volunteerMapper.assignmentToResponse(result));
      },
    );

    app.get(
      '/notifications',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getNotifications',
          response: { 200: notificationListResponseSchema },
        },
      },
      async (request, reply) => {
        const result = await this.volunteerManager.getNotifications({
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(notificationMapper.listToResponse(result));
      },
    );

    app.patch(
      '/notifications/:notificationId',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'markNotificationRead',
          response: { 200: z.object({ marked: z.boolean() }) },
        },
      },
      async (request, reply) => {
        const { notificationId } = request.params as { notificationId: string };
        await this.volunteerManager.markNotificationRead({
          notificationId: VolunteerNotificationId.from(notificationId),
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(200).send({ marked: true });
      },
    );

    app.post(
      '/notifications/read-all',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'markAllNotificationsRead',
        },
      },
      async (request, reply) => {
        await this.volunteerManager.markAllNotificationsRead({
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(201).send({ marked: true });
      },
    );
  }
}
