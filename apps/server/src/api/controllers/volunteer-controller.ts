import 'reflect-metadata';
import { auth } from '@church/auth';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import {
  AssignmentId,
  AvailabilityCheckId,
  ChurchId,
  MinistryId,
  ShiftId,
  UserId,
  VolunteerId,
  VolunteerNotificationId,
} from '../../domain/branded-ids';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  notificationListResponseSchema,
  notificationMapper,
} from '../dtos/notification.dto';
import {
  assignmentListResponseSchema,
  assignmentResponseSchema,
  availabilityCheckDetailResponseSchema,
  availabilityCheckListResponseSchema,
  dashboardResponseSchema,
  ministryScheduleResponseSchema,
  respondToAssignmentBodySchema,
  setUnavailabilityMarksBodySchema,
  volunteerMapper,
} from '../dtos/volunteer.dto';
import { headersFromRequest } from '../utils/headers';

interface MinistryRouteParams {
  ministryId: string;
}

interface AvailabilityCheckRouteParams {
  checkId: string;
}

interface AssignmentRouteParams {
  assignmentId: string;
}

interface NotificationRouteParams {
  notificationId: string;
}

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
        const { ministryId } = request.params as MinistryRouteParams;
        const schedule = await this.volunteerManager.getMinistrySchedule({
          ministryId: MinistryId.from(ministryId),
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(volunteerMapper.ministryScheduleToResponse(schedule));
      },
    );

    app.get(
      '/availability-checks',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'listAvailabilityChecks',
          response: { 200: availabilityCheckListResponseSchema },
        },
      },
      async (request, reply) => {
        const summaries = await this.volunteerManager.listAvailabilityChecks({
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(
          volunteerMapper.availabilityCheckListToResponse(summaries),
        );
      },
    );

    app.get(
      '/availability-checks/:checkId',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getAvailabilityCheck',
          response: { 200: availabilityCheckDetailResponseSchema },
        },
      },
      async (request, reply) => {
        const { checkId } = request.params as AvailabilityCheckRouteParams;
        const detail = await this.volunteerManager.getAvailabilityCheck({
          checkId: AvailabilityCheckId.from(checkId),
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(
          volunteerMapper.availabilityCheckDetailToResponse(detail),
        );
      },
    );

    app.put(
      '/availability-checks/:checkId/marks',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'setUnavailabilityMarks',
          body: setUnavailabilityMarksBodySchema,
          response: { 200: availabilityCheckDetailResponseSchema },
        },
      },
      async (request, reply) => {
        const { checkId } = request.params as AvailabilityCheckRouteParams;
        const body = request.body as z.infer<
          typeof setUnavailabilityMarksBodySchema
        >;
        const detail = await this.volunteerManager.setUnavailability({
          checkId: AvailabilityCheckId.from(checkId),
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
          shiftIds: body.shiftIds.map((shiftId) => ShiftId.from(shiftId)),
          wholeDayDates: body.wholeDayDates,
        });
        return reply.send(
          volunteerMapper.availabilityCheckDetailToResponse(detail),
        );
      },
    );

    app.post(
      '/availability-checks/:checkId/confirm',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'confirmAvailabilityCheck',
        },
      },
      async (request, reply) => {
        const { checkId } = request.params as AvailabilityCheckRouteParams;
        await this.volunteerManager.confirmAvailabilityCheck({
          checkId: AvailabilityCheckId.from(checkId),
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
        const { assignmentId } = request.params as AssignmentRouteParams;
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
        const { notificationId } = request.params as NotificationRouteParams;
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
