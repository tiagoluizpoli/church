import { z } from 'zod';
import { CycleId, EventId, EventTimeBlockId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IPlanningEventManager } from '../../domain/contracts/application/planning-event-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import { createChurchAdminHook } from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  authErrorResponses,
  errorResponseSchema,
} from '../dtos/error-response.dto';
import {
  createEventTimeBlockBodySchema,
  cycleEventTimeBlockParamsSchema,
  eventTimeBlockMapper,
  eventTimeBlockResponseSchema,
  updateEventTimeBlockBodySchema,
} from '../dtos/event-time-block.dto';
import {
  cancellationImpactResponseSchema,
  cancelPlanningEventBodySchema,
  cycleEventParamsSchema,
  eventMoveMapper,
  eventMovePreviewMapper,
  eventMovePreviewResponseSchema,
  eventMoveResponseSchema,
  movePlanningEventBodySchema,
} from '../dtos/planning-event.dto';
import { validationErrorResponseSchema } from '../dtos/validation-error.dto';
import { assertCancelConfirmation } from '../utils/cancel-confirmation';
import {
  dateFromInstantString,
  optionalDateFromInstantString,
} from '../utils/request-time';
import type { EventTimeBlockAdminControllerDependencies } from './event-time-block-admin-controller.types';

/** Church-admin routes for the EventTimeBlocks of a planning Event. */
export class EventTimeBlockAdminController implements FastifyController {
  readonly prefix = '/admin';

  private readonly planningEventManager: IPlanningEventManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly sessionGateway: SessionGateway;
  private readonly authorityGuard: IAuthorityGuard;

  constructor({
    planningEventManager,
    activeChurchResolver,
    sessionGateway,
    authorityGuard,
  }: EventTimeBlockAdminControllerDependencies) {
    this.planningEventManager = planningEventManager;
    this.activeChurchResolver = activeChurchResolver;
    this.sessionGateway = sessionGateway;
    this.authorityGuard = authorityGuard;
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
        sessionGateway: this.sessionGateway,
      }),
    );

    app.addHook(
      'preValidation',
      createChurchAdminHook({ authorityGuard: this.authorityGuard }),
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/event-time-blocks',
      {
        schema: {
          params: cycleEventParamsSchema,
          tags: ['planning'],
          operationId: 'createPlanningEventTimeBlock',
          summary: 'Create a EventTimeBlock on an Event',
          description:
            'Create a church-level EventTimeBlock within an Event. The resulting Event graph must pass the final-graph rules (every block within the Event bounds, labels non-empty and unique, start before end), refused with VALIDATION_ERROR before any write.',
          body: createEventTimeBlockBodySchema,
          response: {
            201: eventTimeBlockResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params;
        const body = request.body;
        const eventTimeBlock =
          await this.planningEventManager.createEventTimeBlock({
            churchId: request.churchId,
            cycleId: CycleId.from(cycleId),
            eventId: EventId.from(eventId),
            startTime: dateFromInstantString({ value: body.startTime }),
            endTime: dateFromInstantString({ value: body.endTime }),
            label: body.label,
          });
        return reply
          .status(201)
          .send(eventTimeBlockMapper.toResponse(eventTimeBlock));
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/event-time-blocks/:eventTimeBlockId/move/preview',
      {
        schema: {
          params: cycleEventTimeBlockParamsSchema,
          tags: ['planning'],
          operationId: 'previewPlanningEventTimeBlockMove',
          summary: 'Preview moving an EventTimeBlock',
          description:
            'Preview moving one EventTimeBlock of a scheduled Event in a Sent Cycle to a new start, writing and sending nothing. Only that block and its Shifts move (duration preserved); the Event bounds stretch to contain it, never shrink. Returns the proposed bounds and a typed clash row for each active Assignment of the block that would strictly overlap another active Assignment of the Church. Advisory only: a later confirm recalculates. Refuses as the Event move does; an unknown or foreign block is 404.',
          body: movePlanningEventBodySchema,
          response: {
            200: eventMovePreviewResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId, eventTimeBlockId } = request.params;
        const body = request.body;
        const move = {
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          scope: {
            kind: 'eventTimeBlock' as const,
            eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockId),
          },
          start: dateFromInstantString({ value: body.start }),
        };
        const preview = await this.planningEventManager.previewMove(move);
        const response = eventMovePreviewMapper.toResponse(preview);
        return reply.send(response);
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/event-time-blocks/:eventTimeBlockId/move',
      {
        schema: {
          params: cycleEventTimeBlockParamsSchema,
          tags: ['planning'],
          operationId: 'movePlanningEventTimeBlock',
          summary: 'Move an EventTimeBlock',
          description:
            'Move one EventTimeBlock of a scheduled Event in a Sent Cycle to a new start under the same Church lock and recalculation as an Event move. Only that block and its Shifts move; the Event bounds stretch, never shrink. Withdraws only the active Assignments of the block that would strictly overlap another active Assignment, with established removal behavior. Returns the moved graph and the actual withdrawals.',
          body: movePlanningEventBodySchema,
          response: {
            200: eventMoveResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId, eventTimeBlockId } = request.params;
        const body = request.body;
        const move = {
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          scope: {
            kind: 'eventTimeBlock' as const,
            eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockId),
          },
          start: dateFromInstantString({ value: body.start }),
          actingUserId: request.userId,
        };
        const result = await this.planningEventManager.confirmMove(move);
        const response = eventMoveMapper.toResponse(result);
        return reply.send(response);
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/event-time-blocks/:eventTimeBlockId/cancel/preview',
      {
        schema: {
          params: cycleEventTimeBlockParamsSchema,
          tags: ['planning'],
          operationId: 'previewPlanningEventTimeBlockCancellation',
          summary: 'Preview cancelling an EventTimeBlock',
          description:
            'Preview cancelling one future EventTimeBlock of a scheduled Event in a Sent Cycle, writing and sending nothing. Same impact shape as the Event preview, limited to that block. Refuses as the Event preview does; a block that has started is ADMIN_CANCELLATION_WINDOW_CLOSED, a cancelled block is ILLEGAL_STATE_TRANSITION, an unknown or foreign block is 404.',
          response: {
            200: cancellationImpactResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId, eventTimeBlockId } = request.params;
        const impact = await this.planningEventManager.previewCancellation({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          scope: {
            kind: 'eventTimeBlock',
            eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockId),
          },
        });
        return reply.send(impact);
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/event-time-blocks/:eventTimeBlockId/cancel',
      {
        schema: {
          params: cycleEventTimeBlockParamsSchema,
          tags: ['planning'],
          operationId: 'cancelPlanningEventTimeBlock',
          summary: 'Cancel an EventTimeBlock',
          description:
            'Irreversibly cancel one future EventTimeBlock of a scheduled Event in a Sent Cycle, under the same confirmation word, locks and single transaction as an Event cancellation but limited to that block: only its Assignments, SwapRequests, UnavailableShifts and last-told entries are touched, N9 lists only its published Shifts and N10 carries the block bounds. The Event and sibling blocks are untouched. Returns the actual impact.',
          body: cancelPlanningEventBodySchema,
          response: {
            200: cancellationImpactResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId, eventTimeBlockId } = request.params;
        const { confirmation, hidden } = request.body;
        assertCancelConfirmation({ confirmation, locale: request.locale });
        const impact = await this.planningEventManager.confirmCancellation({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          scope: {
            kind: 'eventTimeBlock',
            eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockId),
          },
          actingUserId: request.userId,
          hidden,
        });
        return reply.send(impact);
      },
    );

    app.patch(
      '/cycles/:cycleId/events/:eventId/event-time-blocks/:eventTimeBlockId',
      {
        schema: {
          params: cycleEventTimeBlockParamsSchema,
          tags: ['planning'],
          operationId: 'updatePlanningEventTimeBlock',
          summary: 'Update a EventTimeBlock',
          description:
            "Update a EventTimeBlock's bounds or label; an omitted field keeps its stored value. The resulting Event graph must pass the final-graph rules (every block within the Event bounds, labels non-empty and unique, start before end), refused with VALIDATION_ERROR before any write.",
          body: updateEventTimeBlockBodySchema,
          response: {
            200: eventTimeBlockResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId, eventTimeBlockId } = request.params;
        const body = request.body;
        const eventTimeBlock =
          await this.planningEventManager.updateEventTimeBlock({
            churchId: request.churchId,
            cycleId: CycleId.from(cycleId),
            eventId: EventId.from(eventId),
            eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockId),
            startTime: optionalDateFromInstantString({
              value: body.startTime,
            }),
            endTime: optionalDateFromInstantString({ value: body.endTime }),
            label: body.label,
          });
        return reply.send(eventTimeBlockMapper.toResponse(eventTimeBlock));
      },
    );

    app.delete(
      '/cycles/:cycleId/events/:eventId/event-time-blocks/:eventTimeBlockId',
      {
        schema: {
          params: cycleEventTimeBlockParamsSchema,
          tags: ['planning'],
          operationId: 'deletePlanningEventTimeBlock',
          summary: 'Delete a EventTimeBlock',
          description: 'Delete a EventTimeBlock from an Event.',
          response: {
            204: z.null(),
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId, eventTimeBlockId } = request.params;
        await this.planningEventManager.deleteEventTimeBlock({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockId),
        });
        return reply.status(204).send(null);
      },
    );
  }
}
