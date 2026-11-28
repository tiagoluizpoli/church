import { z } from 'zod';
import {
  CycleId,
  EventId,
  EventTemplateId,
  EventTimeBlockId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IPlanningEventManager } from '../../domain/contracts/application/planning-event-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import { createChurchAdminHook } from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import { cycleParamsSchema } from '../dtos/cycle.dto';
import {
  authErrorResponses,
  errorResponseSchema,
} from '../dtos/error-response.dto';
import {
  applyTemplatesBodySchema,
  eventTemplateMapper,
  generatedPlanningCountsResponseSchema,
} from '../dtos/event-template.dto';
import { cycleEventTimeBlockParamsSchema } from '../dtos/event-time-block.dto';
import {
  cancellationImpactResponseSchema,
  cancelPlanningEventBodySchema,
  createPlanningEventBodySchema,
  cycleEventParamsSchema,
  editPlanningEventBodySchema,
  eventEditPreviewMapper,
  eventEditPreviewResponseSchema,
  eventGraphMapper,
  eventGraphResponseSchema,
  eventMoveMapper,
  eventMovePreviewMapper,
  eventMovePreviewResponseSchema,
  eventMoveResponseSchema,
  movePlanningEventBodySchema,
  planningEventBodyMapper,
  setPlanningHiddenBodySchema,
  updatePlanningEventBodySchema,
  updatePlanningEventDetailsBodySchema,
} from '../dtos/planning-event.dto';
import { validationErrorResponseSchema } from '../dtos/validation-error.dto';
import { assertCancelConfirmation } from '../utils/cancel-confirmation';
import { dateFromInstantString } from '../utils/request-time';
import type { PlanningEventAdminControllerDependencies } from './planning-event-admin-controller.types';

/** Church-admin routes for a Cycle's planning Events: apply, create, edit, move, cancel and hide. */
export class PlanningEventAdminController implements FastifyController {
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
  }: PlanningEventAdminControllerDependencies) {
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
      '/cycles/:cycleId/apply-templates',
      {
        schema: {
          params: cycleParamsSchema,
          tags: ['planning'],
          operationId: 'applyPlanningTemplates',
          summary: 'Apply EventTemplates to a Cycle',
          description:
            'Generate one Event per matching CalendarDay in the Cycle for each selected EventTemplate, with one EventTimeBlock per TemplateTimeBlock. A loser of a Template Precedence skips only its blocks overlapping the winner’s on days the winner’s Recurrence names; blocks already in the Cycle that would now lose are listed in `leftoverEventTimeBlocks` and never deleted.',
          body: applyTemplatesBodySchema,
          response: {
            201: generatedPlanningCountsResponseSchema,
            ...authErrorResponses,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        const body = request.body;
        const result = await this.planningEventManager.generateFromTemplates({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          templateIds: body.templateIds.map(EventTemplateId.from),
        });
        return reply
          .status(201)
          .send(eventTemplateMapper.generatedCountsToResponse(result));
      },
    );

    app.post(
      '/cycles/:cycleId/events',
      {
        schema: {
          params: cycleParamsSchema,
          tags: ['planning'],
          operationId: 'createPlanningEvent',
          summary: 'Create an Event with its Time blocks',
          description:
            'Create a one-off or multi-day Event and every one of its EventTimeBlocks together, with its participation scaffold and no staffing. A Draft Cycle saves a Draft Event; a Sent Cycle saves a scheduled Event, every active Ministry starts Not served at its Schedule stage, and affected leaders get an N10 Notification. Its Church-local start day must fall within the inclusive Cycle; its end may spill past it.',
          body: createPlanningEventBodySchema,
          response: {
            201: eventGraphResponseSchema,
            ...authErrorResponses,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        const graph = await this.planningEventManager.createEvent({
          churchId: request.churchId,
          actingUserId: request.userId,
          cycleId: CycleId.from(cycleId),
          ...planningEventBodyMapper.create(request.body),
        });
        return reply.status(201).send(eventGraphMapper.toResponse(graph));
      },
    );

    app.patch(
      '/cycles/:cycleId/events/:eventId',
      {
        schema: {
          params: cycleEventParamsSchema,
          tags: ['planning'],
          operationId: 'updatePlanningEvent',
          summary: 'Edit a Draft Event with its Time blocks',
          description:
            'Replace a Draft Event in a Draft Cycle with its complete desired fields and EventTimeBlocks, validated as a final graph before any write. A block with an id is updated in place and keeps its source-template link; a block without one is created as a manual block; an omitted persisted block is deleted. Submitted bounds are saved exactly. The stored description and source-template ids are kept.',
          body: updatePlanningEventBodySchema,
          response: {
            200: eventGraphResponseSchema,
            ...authErrorResponses,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params;
        const graph = await this.planningEventManager.updateEvent({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          ...planningEventBodyMapper.update(request.body),
        });
        return reply.send(eventGraphMapper.toResponse(graph));
      },
    );

    app.patch(
      '/cycles/:cycleId/events/:eventId/details',
      {
        schema: {
          params: cycleEventParamsSchema,
          tags: ['planning'],
          operationId: 'updatePlanningEventDetails',
          summary: 'Edit the details of a Sent Event',
          description:
            'Change only the title and location of an Event in a Sent Cycle; omitting the location clears it. EventTimeBlocks, Shifts and Assignments are untouched and no Notification is created. Past Cycles are read-only.',
          body: updatePlanningEventDetailsBodySchema,
          response: {
            200: eventGraphResponseSchema,
            ...authErrorResponses,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params;
        const details = {
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          ...planningEventBodyMapper.details(request.body),
        };
        const graph =
          await this.planningEventManager.updateEventDetails(details);
        const response = eventGraphMapper.toResponse(graph);
        return reply.send(response);
      },
    );

    app.delete(
      '/cycles/:cycleId/events/:eventId',
      {
        schema: {
          params: cycleEventParamsSchema,
          tags: ['planning'],
          operationId: 'deletePlanningEvent',
          summary: 'Delete a Draft Event',
          description:
            'Hard-delete an unsent Draft Event of a Draft Cycle with its draft calendar and participation data. No Notification is created.',
          response: { 204: z.null(), ...authErrorResponses },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params;
        await this.planningEventManager.deleteEvent({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
        });
        return reply.status(204).send(null);
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/cancel/preview',
      {
        schema: {
          params: cycleEventParamsSchema,
          tags: ['planning'],
          operationId: 'previewPlanningEventCancellation',
          summary: 'Preview cancelling an Event',
          description:
            'Preview cancelling a scheduled Event of a Sent Cycle, writing and sending nothing. Returns the scope bounds, the distinct published Volunteers who would be told (N9) and the Ministries they span, one told-count row per participating Ministry, and the open SwapRequests that would close. Advisory only: confirm recalculates. Refuses a Draft or Past Cycle or non-scheduled Event (ILLEGAL_STATE_TRANSITION) and an Event that has started (ADMIN_CANCELLATION_WINDOW_CLOSED).',
          response: {
            200: cancellationImpactResponseSchema,
            ...authErrorResponses,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params;
        const impact = await this.planningEventManager.previewCancellation({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          scope: { kind: 'event' },
        });
        return reply.send(impact);
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/cancel',
      {
        schema: {
          params: cycleEventParamsSchema,
          tags: ['planning'],
          operationId: 'cancelPlanningEvent',
          summary: 'Cancel an Event',
          description:
            "Irreversibly cancel a scheduled Event of a Sent Cycle. The confirmation must be the request locale's fixed word (cancel / cancelar), trimmed and case-insensitive, else 422 VALIDATION_ERROR reason CANCEL_CONFIRMATION. Recalculates the impact under the Church and Event Participation locks, then in one transaction: soft-cancels and audits (event_cancelled, acting User) every active Assignment, closes their open SwapRequests as covered without N8, deletes their UnavailableShifts, drops only their last-told entries, enqueues N9 per published Volunteer and N10 per leader, and cancels the Event. Returns the actual impact. Refuses as preview does; a racing confirm gets ILLEGAL_STATE_TRANSITION.",
          body: cancelPlanningEventBodySchema,
          response: {
            200: cancellationImpactResponseSchema,
            ...authErrorResponses,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params;
        const { confirmation, hidden } = request.body;
        assertCancelConfirmation({ confirmation, locale: request.locale });
        const impact = await this.planningEventManager.confirmCancellation({
          hidden,
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          scope: { kind: 'event' },
          actingUserId: request.userId,
        });
        return reply.send(impact);
      },
    );

    app.put(
      '/cycles/:cycleId/events/:eventId/hidden',
      {
        schema: {
          params: cycleEventParamsSchema,
          tags: ['planning'],
          operationId: 'setPlanningEventHidden',
          summary: 'Hide or show a cancelled Event',
          description:
            'Hide a cancelled Event, with every EventTimeBlock in it, from everyone but ChurchAdmins planning the Cycle, or show it again. Allowed at any time, after its start too, and sends nothing. Refuses an Event that is not cancelled (ILLEGAL_STATE_TRANSITION); an unknown, foreign or wrong-Cycle Event is 404.',
          body: setPlanningHiddenBodySchema,
          response: {
            204: z.null(),
            ...authErrorResponses,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params;
        const { hidden } = request.body;
        await this.planningEventManager.setHidden({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          scope: { kind: 'event' },
          hidden,
        });
        return reply.status(204).send(null);
      },
    );

    app.put(
      '/cycles/:cycleId/events/:eventId/event-time-blocks/:eventTimeBlockId/hidden',
      {
        schema: {
          params: cycleEventTimeBlockParamsSchema,
          tags: ['planning'],
          operationId: 'setPlanningEventTimeBlockHidden',
          summary: 'Hide or show a cancelled EventTimeBlock',
          description:
            "Set a cancelled EventTimeBlock's own hidden choice; a block of a hidden Event stays hidden whatever its own. Allowed at any time and sends nothing. Refuses a block that is not itself cancelled (ILLEGAL_STATE_TRANSITION); an unknown, foreign or wrong-Cycle block is 404.",
          body: setPlanningHiddenBodySchema,
          response: {
            204: z.null(),
            ...authErrorResponses,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId, eventTimeBlockId } = request.params;
        const { hidden } = request.body;
        await this.planningEventManager.setHidden({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          scope: {
            kind: 'eventTimeBlock',
            eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockId),
          },
          hidden,
        });
        return reply.status(204).send(null);
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/move/preview',
      {
        schema: {
          params: cycleEventParamsSchema,
          tags: ['planning'],
          operationId: 'previewPlanningEventMove',
          summary: 'Preview moving an Event',
          description:
            'Preview moving a scheduled Event of a Sent Cycle to a new start, writing and sending nothing. Returns the proposed Event and EventTimeBlock bounds (duration preserved, one delta for the Event, its EventTimeBlocks and Shifts) and a typed clash row, with Volunteer and Ministry identities, for each active Assignment that would strictly overlap another active Assignment of the Church (touching ends are compatible). Advisory only: a later confirm recalculates. Refuses a Past Cycle or non-scheduled Event (ILLEGAL_STATE_TRANSITION), an Event that has started or a target start that is not in the future (MOVE_WINDOW_CLOSED) and a final start day outside the inclusive Cycle (EVENT_OUTSIDE_CYCLE); the end may spill.',
          body: movePlanningEventBodySchema,
          response: {
            200: eventMovePreviewResponseSchema,
            ...authErrorResponses,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params;
        const body = request.body;
        const move = {
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          scope: { kind: 'event' } as const,
          start: dateFromInstantString({ value: body.start }),
        };
        const preview = await this.planningEventManager.previewMove(move);
        const response = eventMovePreviewMapper.toResponse(preview);
        return reply.send(response);
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/move',
      {
        schema: {
          params: cycleEventParamsSchema,
          tags: ['planning'],
          operationId: 'movePlanningEvent',
          summary: 'Move an Event',
          description:
            'Move a scheduled Event of a Sent Cycle to a new start. Recalculates the clashes under the Church lock shared with Assignment creation (never trusting a preview), applies one delta to the Event, its active EventTimeBlocks and their Shifts, and withdraws only the active Assignments that would strictly overlap another active Assignment of the Church: each is audited, its open SwapRequest closes as covered, and it is deleted. Kept Assignments keep their identity, UnavailableShifts and open SwapRequests; last-told snapshots are untouched, so Send updates tells Volunteers. Returns the moved graph and the actual withdrawals. Refuses as preview does.',
          body: movePlanningEventBodySchema,
          response: {
            200: eventMoveResponseSchema,
            ...authErrorResponses,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params;
        const body = request.body;
        const move = {
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          scope: { kind: 'event' } as const,
          start: dateFromInstantString({ value: body.start }),
          actingUserId: request.userId,
        };
        const result = await this.planningEventManager.confirmMove(move);
        const response = eventMoveMapper.toResponse(result);
        return reply.send(response);
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/edit/preview',
      {
        schema: {
          params: cycleEventParamsSchema,
          tags: ['planning'],
          operationId: 'previewPlanningEventEdit',
          summary: 'Preview editing a sent Event',
          description:
            "Preview new bounds and EventTimeBlocks for a scheduled Event of a Sent Cycle, writing and sending nothing. A block with `id` keeps that active block, one without is added and a left-out block is dropped. Each kept Shift keeps its share of its block. Returns the proposed bounds, a row per kept, added or dropped block and a typed clash row, with Volunteer and Ministry identities, for each active Assignment whose new Shift would strictly overlap another active Assignment of its Volunteer (touching ends are compatible; of two of the Event's own, the earlier is kept). Advisory only: a later apply recalculates. Allowed while the Event runs. Refuses a Past Cycle or non-scheduled Event (ILLEGAL_STATE_TRANSITION), an ended Event (EDIT_WINDOW_CLOSED), a proposal breaking the final-graph rules (VALIDATION_ERROR, EVENT_OUTSIDE_CYCLE), a dropped block with active Assignments (STAFFED_EVENT_TIME_BLOCK_DROP: cancel it instead) and an unknown or foreign block (404).",
          body: editPlanningEventBodySchema,
          response: {
            200: eventEditPreviewResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params;
        const preview = await this.planningEventManager.previewEdit({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          ...planningEventBodyMapper.edit(request.body),
        });
        return reply.send(eventEditPreviewMapper.toResponse(preview));
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/edit',
      {
        schema: {
          params: cycleEventParamsSchema,
          tags: ['planning'],
          operationId: 'editPlanningEvent',
          summary: 'Edit a sent Event',
          description:
            'Apply new bounds and EventTimeBlocks to a scheduled Event of a Sent Cycle, with the body of the edit preview. Recalculates the clashes under the Church lock shared with Assignment creation (never trusting a preview) and withdraws only the active Assignments whose new Shift would strictly overlap another active Assignment of their Volunteer: each is audited, its open SwapRequest closes as covered, and it is deleted. The Event and its kept blocks take the new times, a Shift still to come keeping its share of the rest of its block, a running one its start and an ended one its times; kept Assignments keep their identity, UnavailableShifts and open SwapRequests. A block without `id` is added with a Shift per Participation; a left-out unstaffed block is cancelled, never deleted. Last-told snapshots are untouched, so Send updates tells Volunteers (never about a started Shift); the leaders of the affected Ministries get the Event changed alert. Returns the edited graph and the actual withdrawals. Refuses as the preview does.',
          body: editPlanningEventBodySchema,
          response: {
            200: eventMoveResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params;
        const result = await this.planningEventManager.confirmEdit({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          ...planningEventBodyMapper.edit(request.body),
          actingUserId: request.userId,
        });
        return reply.send(eventMoveMapper.toResponse(result));
      },
    );
  }
}
