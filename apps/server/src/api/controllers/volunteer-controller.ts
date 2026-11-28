import { NotFoundError } from '@church/core';
import { z } from 'zod';
import {
  AssignmentId,
  AvailabilityCheckId,
  ChurchId,
  CycleId,
  MinistryId,
  ShiftId,
  UserId,
  VolunteerId,
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
  assignmentParamsSchema,
  idSchema,
  ministryParamsSchema,
} from '../dtos/id.dto';
import {
  answerAvailabilityCheckBodySchema,
  answerConflictResponseSchema,
  assignmentDetailResponseSchema,
  availabilityCheckDetailResponseSchema,
  availabilityCheckListQuerystringSchema,
  availabilityCheckListResponseSchema,
  availabilityCheckParamsSchema,
  dashboardResponseSchema,
  ministryScheduleResponseSchema,
  volunteerMapper,
} from '../dtos/volunteer.dto';
import { refuse } from '../utils/refuse';
import type {
  PrivateObjectOperationInput,
  VolunteerControllerDependencies,
} from './volunteer-controller.types';

const ministryScheduleQuerySchema = z.object({
  cycleId: idSchema,
});

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

  constructor({
    volunteerManager,
    activeChurchResolver,
  }: VolunteerControllerDependencies) {
    this.volunteerManager = volunteerManager;
    this.activeChurchResolver = activeChurchResolver;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
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
          userId: UserId.from(request.userId),
          volunteerId: VolunteerId.from(request.volunteerId as string),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(volunteerMapper.dashboardToResponse(dashboard));
      },
    );

    app.get(
      '/assignments/:assignmentId',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getAssignmentDetail',
          params: assignmentParamsSchema,
          summary: "Get one of the caller's Assignments",
          description:
            "Get one of the current Volunteer's own published Assignments with its Shift roster. Anyone else's, or one no longer on the schedule, is 404.",
          response: {
            200: assignmentDetailResponseSchema,
            404: notFoundResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params;
        const detail = await this.withPrivateObjectNotFound({
          request,
          reply,
          operation: () =>
            this.volunteerManager.getAssignmentDetail({
              assignmentId: AssignmentId.from(assignmentId),
              userId: UserId.from(request.userId),
              volunteerId: VolunteerId.from(request.volunteerId as string),
              churchId: ChurchId.from(request.churchId),
            }),
        });
        if (!detail) return;
        return reply.send(detail);
      },
    );

    app.get(
      '/ministries/:ministryId/schedule',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getMinistrySchedule',
          params: ministryParamsSchema,
          querystring: ministryScheduleQuerySchema,
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
        const { ministryId } = request.params;
        const { cycleId } = request.query;
        let schedule: MinistrySchedule;
        try {
          schedule = await this.volunteerManager.getMinistrySchedule({
            ministryId: MinistryId.from(ministryId),
            cycleId: CycleId.from(cycleId),
            volunteerId: VolunteerId.from(request.volunteerId as string),
            churchId: ChurchId.from(request.churchId),
          });
        } catch (error) {
          if (
            error instanceof IsolationBreachError ||
            error instanceof NotFoundError
          ) {
            return refuse({ reply, request, code: 'NOT_FOUND' });
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
          querystring: availabilityCheckListQuerystringSchema,
          description:
            "List the current Volunteer's AvailabilityChecks. `state` narrows `checks` only: `counts` covers every state.",
          response: { 200: availabilityCheckListResponseSchema },
        },
      },
      async (request, reply) => {
        const { state } = request.query;
        const owner = {
          volunteerId: VolunteerId.from(request.volunteerId as string),
          churchId: ChurchId.from(request.churchId),
        };
        const [summaries, counts] = await Promise.all([
          this.volunteerManager.listAvailabilityChecks({ ...owner, state }),
          this.volunteerManager.countAvailabilityChecks(owner),
        ]);
        const listed =
          volunteerMapper.availabilityCheckListToResponse(summaries);
        return reply.send({ ...listed, counts });
      },
    );

    app.get(
      '/availability-checks/:checkId',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getAvailabilityCheck',
          params: availabilityCheckParamsSchema,
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
        const { checkId } = request.params;
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
      '/availability-checks/:checkId/answer',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'answerAvailabilityCheck',
          params: availabilityCheckParamsSchema,
          summary: 'Answer an AvailabilityCheck',
          description:
            "Record the current Volunteer's unavailable shifts — by Shift or by whole CalendarDay — against an AvailabilityCheck.",
          body: answerAvailabilityCheckBodySchema,
          response: {
            200: availabilityCheckDetailResponseSchema,
            404: notFoundResponseSchema,
            409: answerConflictResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { checkId } = request.params;
        const body = request.body;
        const detail = await this.withPrivateObjectNotFound({
          request,
          reply,
          operation: () =>
            this.volunteerManager.answerAvailabilityCheck({
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
        refuse({ reply, request, code: 'NOT_FOUND' });
        return undefined;
      }
      throw error;
    }
  }
}
