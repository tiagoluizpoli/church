import type { AppConfig } from '@church/app-config';
import { NotFoundError } from '@church/core';
import { instantSchema, toDate } from '@church/time';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AssignmentId,
  AvailabilityCheckId,
  ChurchId,
  MinistryId,
  ShiftId,
  VolunteerId,
  VolunteerNotificationId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type {
  IVolunteerManager,
  MinistrySchedule,
} from '../../domain/contracts/application/volunteer-manager';
import { AssignmentAccessDeniedError } from '../../domain/errors/assignment-access-denied';
import { CheckAccessDeniedError } from '../../domain/errors/check-access-denied';
import { IsolationBreachError } from '../../domain/errors/isolation-breach-error';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
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
  setUnavailableShiftsBodySchema,
  volunteerMapper,
} from '../dtos/volunteer.dto';
import { refuse } from '../utils/refuse';

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

const getNotificationsQuerystringSchema = z.object({
  cursor: instantSchema.optional(),
  limit: z.coerce.number().optional(),
});

interface VolunteerControllerDependencies {
  volunteerManager: IVolunteerManager;
  activeChurchResolver: IActiveChurchResolver;
  config: AppConfig;
}

interface PrivateObjectOperationInput<T> {
  request: FastifyRequest;
  reply: FastifyReply;
  operation: () => Promise<T>;
}

const notFoundResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export class VolunteerController implements FastifyController {
  readonly prefix = '/volunteer';
  // `VolunteerId.from(request.volunteerId as string)` below: this
  // controller's preValidation hook requires a Volunteer profile for every
  // route, so `volunteerId` is always present here despite being optional
  // on `FastifyRequest`.

  private readonly volunteerManager: IVolunteerManager;
  private readonly activeChurchResolver: IActiveChurchResolver;

  private readonly parked: AppConfig['parked'];

  constructor({
    volunteerManager,
    activeChurchResolver,
    config,
  }: VolunteerControllerDependencies) {
    this.volunteerManager = volunteerManager;
    this.activeChurchResolver = activeChurchResolver;
    const { parked } = config;
    this.parked = parked;
  }

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({
        resolver: this.activeChurchResolver,
        requireVolunteer: true,
      }),
    );

    app.get(
      '/dashboard',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getVolunteerDashboard',
          summary: "Get the caller's Volunteer dashboard",
          description:
            "Get the current Volunteer's dashboard summary for the Active Church.",
          response: { 200: dashboardResponseSchema },
        },
      },
      async (request, reply) => {
        const dashboard = await this.volunteerManager.getDashboard({
          volunteerId: VolunteerId.from(request.volunteerId as string),
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
          summary: "Get the caller's upcoming Assignments",
          description: "List the current Volunteer's upcoming Assignments.",
          response: { 200: assignmentListResponseSchema },
        },
      },
      async (request, reply) => {
        const assignments = await this.volunteerManager.getUpcomingAssignments({
          volunteerId: VolunteerId.from(request.volunteerId as string),
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
          summary: "Get the caller's published Ministry schedule",
          description:
            "Get the current Volunteer's published schedule within one Ministry.",
          response: {
            200: ministryScheduleResponseSchema,
            404: notFoundResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params as MinistryRouteParams;
        let schedule: MinistrySchedule;
        try {
          schedule = await this.volunteerManager.getMinistrySchedule({
            ministryId: MinistryId.from(ministryId),
            volunteerId: VolunteerId.from(request.volunteerId as string),
            churchId: ChurchId.from(request.churchId),
          });
        } catch (error) {
          if (
            error instanceof IsolationBreachError ||
            error instanceof NotFoundError
          ) {
            return refuse(reply, request, 'NOT_FOUND');
          }
          throw error;
        }
        return reply.send(volunteerMapper.ministryScheduleToResponse(schedule));
      },
    );

    app.get(
      '/availability-checks',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'listAvailabilityChecks',
          summary: "List the caller's AvailabilityChecks",
          description: "List the current Volunteer's AvailabilityChecks.",
          response: { 200: availabilityCheckListResponseSchema },
        },
      },
      async (request, reply) => {
        const summaries = await this.volunteerManager.listAvailabilityChecks({
          volunteerId: VolunteerId.from(request.volunteerId as string),
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
          summary: "Get one of the caller's AvailabilityChecks",
          description:
            'Get the detail of a single AvailabilityCheck belonging to the current Volunteer.',
          response: {
            200: availabilityCheckDetailResponseSchema,
            404: notFoundResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { checkId } = request.params as AvailabilityCheckRouteParams;
        const detail = await this.withPrivateObjectNotFound({
          request,
          reply,
          operation: () =>
            this.volunteerManager.getAvailabilityCheck({
              checkId: AvailabilityCheckId.from(checkId),
              volunteerId: VolunteerId.from(request.volunteerId as string),
              churchId: ChurchId.from(request.churchId),
            }),
        });
        if (!detail) return;
        return reply.send(
          volunteerMapper.availabilityCheckDetailToResponse(detail),
        );
      },
    );

    app.put(
      '/availability-checks/:checkId/unavailable-shifts',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'setUnavailableShifts',
          summary: 'Set unavailable shifts on an AvailabilityCheck',
          description:
            "Record the current Volunteer's unavailable shifts — by Shift or by whole CalendarDay — against an AvailabilityCheck.",
          body: setUnavailableShiftsBodySchema,
          response: {
            200: availabilityCheckDetailResponseSchema,
            404: notFoundResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { checkId } = request.params as AvailabilityCheckRouteParams;
        const body = request.body as z.infer<
          typeof setUnavailableShiftsBodySchema
        >;
        const detail = await this.withPrivateObjectNotFound({
          request,
          reply,
          operation: () =>
            this.volunteerManager.setUnavailableShifts({
              checkId: AvailabilityCheckId.from(checkId),
              volunteerId: VolunteerId.from(request.volunteerId as string),
              churchId: ChurchId.from(request.churchId),
              shiftIds: body.shiftIds.map((shiftId) => ShiftId.from(shiftId)),
              wholeDayDates: body.wholeDayDates,
            }),
        });
        if (!detail) return;
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
          summary: 'Confirm an AvailabilityCheck',
          description:
            "Confirm the current Volunteer's AvailabilityCheck, recording confirmedAt even when no unavailable shifts were left.",
          response: { 204: z.null(), 404: notFoundResponseSchema },
        },
      },
      async (request, reply) => {
        const { checkId } = request.params as AvailabilityCheckRouteParams;
        const confirmed = await this.withPrivateObjectNotFound({
          request,
          reply,
          operation: () =>
            this.volunteerManager.confirmAvailabilityCheck({
              checkId: AvailabilityCheckId.from(checkId),
              volunteerId: VolunteerId.from(request.volunteerId as string),
              churchId: ChurchId.from(request.churchId),
            }),
        });
        if (!confirmed) return;
        return reply.status(204).send(null);
      },
    );

    if (this.parked.assignmentResponse) {
      app.patch(
        '/assignments/:assignmentId',
        {
          schema: {
            tags: ['volunteer'],
            operationId: 'respondToAssignment',
            summary: 'Respond to an Assignment',
            description:
              "Record the current Volunteer's accept/decline response to one of their own Assignments.",
            body: respondToAssignmentBodySchema,
            response: {
              200: assignmentResponseSchema,
              404: notFoundResponseSchema,
            },
          },
        },
        async (request, reply) => {
          const { assignmentId } = request.params as AssignmentRouteParams;
          const body = request.body as z.infer<
            typeof respondToAssignmentBodySchema
          >;
          const result = await this.withPrivateObjectNotFound({
            request,
            reply,
            operation: () =>
              this.volunteerManager.respondToAssignment({
                assignmentId: AssignmentId.from(assignmentId),
                volunteerId: VolunteerId.from(request.volunteerId as string),
                churchId: ChurchId.from(request.churchId),
                response: body.response,
                reason: body.reason,
              }),
          });
          if (!result) return;
          return reply.send(volunteerMapper.assignmentToResponse(result));
        },
      );
    }

    if (this.parked.volunteerCancel) {
      app.post(
        '/assignments/:assignmentId/cancel',
        {
          schema: {
            tags: ['volunteer'],
            operationId: 'cancelOwnAssignment',
            summary: "Cancel one of the caller's Assignments",
            description:
              "Cancel one of the current Volunteer's own Assignments.",
            response: { 204: z.null(), 404: notFoundResponseSchema },
          },
        },
        async (request, reply) => {
          const { assignmentId } = request.params as AssignmentRouteParams;
          const cancelled = await this.withPrivateObjectNotFound({
            request,
            reply,
            operation: async () => {
              await this.volunteerManager.cancelOwnAssignment({
                assignmentId: AssignmentId.from(assignmentId),
                volunteerId: VolunteerId.from(request.volunteerId as string),
                churchId: ChurchId.from(request.churchId),
              });
              return true;
            },
          });
          if (!cancelled) return;
          return reply.status(204).send(null);
        },
      );
    }

    app.get(
      '/notifications',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getNotifications',
          summary: "List the caller's VolunteerNotifications",
          description:
            "List the current Volunteer's VolunteerNotifications, paginated by cursor.",
          querystring: getNotificationsQuerystringSchema,
          response: { 200: notificationListResponseSchema },
        },
      },
      async (request, reply) => {
        const { cursor, limit } = request.query as z.infer<
          typeof getNotificationsQuerystringSchema
        >;
        const result = await this.volunteerManager.getNotifications({
          volunteerId: VolunteerId.from(request.volunteerId as string),
          churchId: ChurchId.from(request.churchId),
          cursor: cursor ? toDate({ instant: cursor }) : undefined,
          limit,
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
          summary: 'Mark a VolunteerNotification read',
          description:
            "Mark one of the current Volunteer's VolunteerNotifications as read.",
          response: {
            200: z.object({ marked: z.boolean() }),
            404: notFoundResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { notificationId } = request.params as NotificationRouteParams;
        try {
          await this.volunteerManager.markNotificationRead({
            notificationId: VolunteerNotificationId.from(notificationId),
            volunteerId: VolunteerId.from(request.volunteerId as string),
            churchId: ChurchId.from(request.churchId),
          });
        } catch (error) {
          if (error instanceof NotFoundError) {
            return refuse(reply, request, 'NOT_FOUND');
          }
          throw error;
        }
        return reply.status(200).send({ marked: true });
      },
    );

    app.post(
      '/notifications/read-all',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'markAllNotificationsRead',
          summary: 'Mark all VolunteerNotifications read',
          description:
            "Mark every one of the current Volunteer's VolunteerNotifications as read.",
        },
      },
      async (request, reply) => {
        await this.volunteerManager.markAllNotificationsRead({
          volunteerId: VolunteerId.from(request.volunteerId as string),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(201).send({ marked: true });
      },
    );
  }

  private async withPrivateObjectNotFound<T>({
    request,
    reply,
    operation,
  }: PrivateObjectOperationInput<T>): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof CheckAccessDeniedError ||
        error instanceof AssignmentAccessDeniedError ||
        error instanceof NotFoundError
      ) {
        refuse(reply, request, 'NOT_FOUND');
        return undefined;
      }
      throw error;
    }
  }
}
