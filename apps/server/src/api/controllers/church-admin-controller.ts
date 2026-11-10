import { NotFoundError } from '@church/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ChurchId,
  CycleId,
  EventId,
  EventTemplateId,
  EventTimeBlockId,
  MinistryId,
  UserId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { ICycleManager } from '../../domain/contracts/application/cycle-manager';
import type { IEventTemplateManager } from '../../domain/contracts/application/event-template-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { IPlanningEventManager } from '../../domain/contracts/application/planning-event-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  createCycleBodySchema,
  cycleDetailsResponseSchema,
  cycleListResponseSchema,
  cycleMapper,
  cycleResponseSchema,
  cycleSendSummaryResponseSchema,
  listCyclesQuerySchema,
  overlappingCycleResponseSchema,
  sendCycleConflictResponseSchema,
  updateCycleBodySchema,
  updateCycleConflictResponseSchema,
} from '../dtos/cycle.dto';
import {
  applyTemplatesBodySchema,
  createEventTemplateBodySchema,
  eventTemplateListResponseSchema,
  eventTemplateMapper,
  eventTemplateResponseSchema,
  eventTemplateUsageResponseSchema,
  generatedPlanningCountsResponseSchema,
  updateEventTemplateBodySchema,
} from '../dtos/event-template.dto';
import {
  createEventTimeBlockBodySchema,
  eventTimeBlockMapper,
  eventTimeBlockResponseSchema,
  updateEventTimeBlockBodySchema,
} from '../dtos/event-time-block.dto';
import { ministryMapper, ministryResponseSchema } from '../dtos/ministry.dto';
import {
  type CreatePlanningEventBody,
  createPlanningEventBodySchema,
  eventGraphMapper,
  eventGraphResponseSchema,
  type UpdatePlanningEventBody,
  type UpdatePlanningEventDetailsBody,
  updatePlanningEventBodySchema,
  updatePlanningEventDetailsBodySchema,
} from '../dtos/planning-event.dto';
import {
  type SetDefaultDirectionBody,
  setDefaultDirectionBodySchema,
} from '../dtos/usual-setup.dto';
import { validationErrorResponseSchema } from '../dtos/validation-error.dto';
import { refuse } from '../utils/refuse';
import {
  dateFromCalendarDayString,
  dateFromInstantString,
  optionalDateFromInstantString,
} from '../utils/request-time';

interface CycleRouteParams {
  cycleId: string;
}

interface EventTemplateRouteParams {
  templateId: string;
}

interface PlanningEventRouteParams {
  cycleId: string;
  eventId: string;
}

interface PlanningEventTimeBlockRouteParams {
  cycleId: string;
  eventId: string;
  eventTimeBlockId: string;
}

interface MinistryRouteParams {
  ministryId: string;
}

const notFoundResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

interface ChurchAdminControllerDependencies {
  cycleManager: ICycleManager;
  eventTemplateManager: IEventTemplateManager;
  planningEventManager: IPlanningEventManager;
  activeChurchResolver: IActiveChurchResolver;
  ministryManager: IMinistryManager;
  authorityGuard: AuthorityGuard;
}

interface NestedObjectOperationInput<T> {
  request: FastifyRequest;
  reply: FastifyReply;
  operation: () => Promise<T>;
}

export class ChurchAdminController implements FastifyController {
  readonly prefix = '/admin';

  private readonly cycleManager: ICycleManager;
  private readonly eventTemplateManager: IEventTemplateManager;
  private readonly planningEventManager: IPlanningEventManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly ministryManager: IMinistryManager;
  private readonly authorityGuard: AuthorityGuard;

  constructor({
    cycleManager,
    eventTemplateManager,
    planningEventManager,
    activeChurchResolver,
    ministryManager,
    authorityGuard,
  }: ChurchAdminControllerDependencies) {
    this.cycleManager = cycleManager;
    this.eventTemplateManager = eventTemplateManager;
    this.planningEventManager = planningEventManager;
    this.activeChurchResolver = activeChurchResolver;
    this.ministryManager = ministryManager;
    this.authorityGuard = authorityGuard;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({ resolver: this.activeChurchResolver }),
    );

    app.addHook('preValidation', async (request, reply) => {
      const authorized = await this.authorityGuard.canManageChurch({
        churchId: ChurchId.from(request.churchId),
        userId: UserId.from(request.userId),
      });
      if (!authorized) {
        return refuse({ reply, request, code: 'FORBIDDEN' });
      }
    });

    app.post(
      '/cycles',
      {
        schema: {
          tags: ['planning'],
          operationId: 'createCycle',
          summary: 'Create a Cycle',
          description:
            'Create a new Cycle over an inclusive CalendarDay range for the Church. A one-day Cycle starts and ends on the same day; a range sharing any day with another Cycle of the Church is refused.',
          body: createCycleBodySchema,
          response: {
            201: cycleResponseSchema,
            409: overlappingCycleResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const body = request.body as z.infer<typeof createCycleBodySchema>;
        const cycle = await this.cycleManager.createCycle({
          churchId: ChurchId.from(request.churchId),
          name: body.name,
          startDate: dateFromCalendarDayString({ value: body.startDate }),
          endDate: dateFromCalendarDayString({ value: body.endDate }),
        });
        return reply.status(201).send(cycleMapper.toResponse(cycle));
      },
    );

    app.get(
      '/cycles',
      {
        schema: {
          tags: ['planning'],
          operationId: 'listCycles',
          summary: 'List Cycles',
          description: 'List the Church Cycles, optionally filtered by state.',
          query: listCyclesQuerySchema,
          response: { 200: cycleListResponseSchema },
        },
      },
      async (request, reply) => {
        const query = request.query as z.infer<typeof listCyclesQuerySchema>;
        const cycles = await this.cycleManager.listCycles({
          churchId: ChurchId.from(request.churchId),
          state: query.state,
        });
        return reply.send(cycleMapper.listToResponse(cycles));
      },
    );

    app.get(
      '/cycles/:cycleId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'getCycle',
          summary: 'Get a Cycle',
          description: 'Get the details of a single Cycle.',
          response: { 200: cycleDetailsResponseSchema },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleRouteParams;
        const details = await this.cycleManager.getCycle({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
        });
        return reply.send(cycleMapper.detailsToResponse(details));
      },
    );

    app.get(
      '/cycles/:cycleId/send-summary',
      {
        schema: {
          tags: ['planning'],
          operationId: 'getCycleSendSummary',
          summary: 'Summarize a Draft Cycle before Send',
          description:
            'Advisory confirmation facts for a Draft Cycle: its Event count and the distinct active Ministries the Usual setup would pre-fill. Send rechecks everything itself. Refuses an empty Draft (EMPTY_CYCLE), legacy Events breaking the final-graph rules (INVALID_CYCLE_EVENTS) and Sent/Past Cycles.',
          response: {
            200: cycleSendSummaryResponseSchema,
            409: sendCycleConflictResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleRouteParams;
        const summary = await this.cycleManager.getSendSummary({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
        });
        return reply.send(summary);
      },
    );

    app.post(
      '/cycles/:cycleId/send',
      {
        schema: {
          tags: ['planning'],
          operationId: 'sendCycle',
          summary: 'Send a Cycle',
          description:
            'Send a Draft Cycle to its Ministries in one transaction: schedule its Events, pre-fill staffing from the Usual setup and enqueue one Cycle-ready Notification per User leading an active Ministry. Refuses an empty Draft (EMPTY_CYCLE), legacy Events breaking the final-graph rules (INVALID_CYCLE_EVENTS), a Draft already holding staffing (DRAFT_STAFFING_RECONCILIATION_REQUIRED) and Sent/Past Cycles (ILLEGAL_STATE_TRANSITION).',
          response: { 204: z.null(), 409: sendCycleConflictResponseSchema },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleRouteParams;
        await this.cycleManager.sendCycle({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
        });
        return reply.status(204).send();
      },
    );

    app.patch(
      '/cycles/:cycleId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'updateCycle',
          summary: 'Edit a Draft Cycle',
          description:
            'Rename or re-date a Draft Cycle; name, startDate and endDate are submitted together as an inclusive CalendarDay range. The Cycle never conflicts with itself. A range sharing a day with another Cycle, or excluding the Church-local start day of any owned Event, is refused; Events are never moved. Sent and Past Cycles are refused.',
          body: updateCycleBodySchema,
          response: {
            200: cycleResponseSchema,
            409: updateCycleConflictResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleRouteParams;
        const body = request.body as z.infer<typeof updateCycleBodySchema>;
        const cycle = await this.cycleManager.updateCycle({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          name: body.name,
          startDate: dateFromCalendarDayString({ value: body.startDate }),
          endDate: dateFromCalendarDayString({ value: body.endDate }),
        });
        return reply.send(cycleMapper.toResponse(cycle));
      },
    );

    app.delete(
      '/cycles/:cycleId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'deleteCycle',
          summary: 'Delete a Draft Cycle',
          description:
            'Hard-delete a Draft Cycle with every Event, Time Block and participation it owns. Sent and Past Cycles are refused.',
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleRouteParams;
        await this.cycleManager.deleteCycle({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
        });
        return reply.status(204).send();
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/reopen',
      {
        schema: {
          tags: ['planning'],
          operationId: 'reopenPlanningEvent',
          summary: 'Reopen an Event for editing',
          description:
            'Move a scheduled Event in a sent Cycle back to draft so it can be edited.',
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params as PlanningEventRouteParams;
        await this.cycleManager.reopenEvent({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
        });
        return reply.status(204).send();
      },
    );

    app.post(
      '/event-templates',
      {
        schema: {
          tags: ['planning'],
          operationId: 'createEventTemplate',
          summary: 'Create an EventTemplate',
          description:
            'Create a church-owned EventTemplate with its ordered TemplateTimeBlocks for a given weekday.',
          body: createEventTemplateBodySchema,
          response: {
            201: eventTemplateResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const body = request.body as z.infer<
          typeof createEventTemplateBodySchema
        >;
        const template = await this.eventTemplateManager.createTemplate({
          churchId: ChurchId.from(request.churchId),
          name: body.name,
          weekday: body.weekday,
          blocks: body.blocks,
        });
        return reply.status(201).send(eventTemplateMapper.toResponse(template));
      },
    );

    app.get(
      '/event-templates',
      {
        schema: {
          tags: ['planning'],
          operationId: 'listEventTemplates',
          summary: 'List EventTemplates',
          description: 'List the Church EventTemplates.',
          response: { 200: eventTemplateListResponseSchema },
        },
      },
      async (request, reply) => {
        const templates = await this.eventTemplateManager.listTemplates({
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(eventTemplateMapper.listToResponse(templates));
      },
    );

    app.get(
      '/event-templates/:templateId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'getEventTemplate',
          summary: 'Get an EventTemplate',
          description:
            'Get one Church EventTemplate with its ordered TemplateTimeBlocks for direct editing.',
          response: { 200: eventTemplateResponseSchema },
        },
      },
      async (request, reply) => {
        const { templateId } = request.params as EventTemplateRouteParams;
        const template = await this.eventTemplateManager.getTemplate({
          churchId: ChurchId.from(request.churchId),
          templateId: EventTemplateId.from(templateId),
        });
        return reply.send(eventTemplateMapper.toResponse(template));
      },
    );

    app.get(
      '/event-templates/:templateId/usage',
      {
        schema: {
          tags: ['planning'],
          operationId: 'getEventTemplateUsage',
          summary: 'Get EventTemplate usage',
          description:
            'Count the distinct Ministries whose UsualSetup references each current TemplateTimeBlock, and across the template.',
          response: { 200: eventTemplateUsageResponseSchema },
        },
      },
      async (request, reply) => {
        const { templateId } = request.params as EventTemplateRouteParams;
        const usage = await this.eventTemplateManager.getTemplateUsage({
          churchId: ChurchId.from(request.churchId),
          templateId: EventTemplateId.from(templateId),
        });
        return reply.send(usage);
      },
    );

    app.patch(
      '/event-templates/:templateId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'updateEventTemplate',
          summary: 'Update an EventTemplate',
          description:
            "Apply an EventTemplate's complete desired name, weekday and TemplateTimeBlocks: blocks with a persisted id are updated in place, blocks without one are created and omitted blocks are deleted with their UsualSetup entries.",
          body: updateEventTemplateBodySchema,
          response: {
            200: eventTemplateResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { templateId } = request.params as EventTemplateRouteParams;
        const body = request.body as z.infer<
          typeof updateEventTemplateBodySchema
        >;
        const template = await this.eventTemplateManager.updateTemplate({
          churchId: ChurchId.from(request.churchId),
          templateId: EventTemplateId.from(templateId),
          name: body.name,
          weekday: body.weekday,
          blocks: body.blocks,
        });
        return reply.send(eventTemplateMapper.toResponse(template));
      },
    );

    app.delete(
      '/event-templates/:templateId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'deleteEventTemplate',
          summary: 'Delete an EventTemplate',
          description: 'Delete an EventTemplate from the Church.',
        },
      },
      async (request, reply) => {
        const { templateId } = request.params as EventTemplateRouteParams;
        await this.eventTemplateManager.deleteTemplate({
          churchId: ChurchId.from(request.churchId),
          templateId: EventTemplateId.from(templateId),
        });
        return reply.status(204).send();
      },
    );

    app.post(
      '/cycles/:cycleId/apply-templates',
      {
        schema: {
          tags: ['planning'],
          operationId: 'applyPlanningTemplates',
          summary: 'Apply EventTemplates to a Cycle',
          description:
            'Generate one Event per matching CalendarDay in the Cycle for each selected EventTemplate, with one EventTimeBlock per TemplateTimeBlock.',
          body: applyTemplatesBodySchema,
          response: { 201: generatedPlanningCountsResponseSchema },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleRouteParams;
        const body = request.body as z.infer<typeof applyTemplatesBodySchema>;
        const result = await this.planningEventManager.generateFromTemplates({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          templateIds: body.templateIds.map(EventTemplateId.from),
        });
        return reply.status(201).send(result);
      },
    );

    app.post(
      '/cycles/:cycleId/events',
      {
        schema: {
          tags: ['planning'],
          operationId: 'createPlanningEvent',
          summary: 'Create a Draft Event with its Time blocks',
          description:
            'Create a one-off or multi-day Draft Event and every one of its EventTimeBlocks together, with its participation scaffold and no staffing. Its Church-local start day must fall within the inclusive Cycle; its end may spill past it.',
          body: createPlanningEventBodySchema,
          response: {
            201: eventGraphResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleRouteParams;
        const body = request.body as CreatePlanningEventBody;
        const location = body.location?.trim();
        const graph = await this.planningEventManager.createEvent({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          title: body.title,
          location: location ? location : undefined,
          start: dateFromInstantString({ value: body.start }),
          end: dateFromInstantString({ value: body.end }),
          eventTimeBlocks: body.eventTimeBlocks.map((block) => ({
            label: block.label,
            startTime: dateFromInstantString({ value: block.startTime }),
            endTime: dateFromInstantString({ value: block.endTime }),
          })),
        });
        return reply.status(201).send(eventGraphMapper.toResponse(graph));
      },
    );

    app.patch(
      '/cycles/:cycleId/events/:eventId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'updatePlanningEvent',
          summary: 'Edit a Draft Event with its Time blocks',
          description:
            'Replace a Draft Event in a Draft Cycle with its complete desired fields and EventTimeBlocks, validated as a final graph before any write. A block with an id is updated in place and keeps its source-template link; a block without one is created as a manual block; an omitted persisted block is deleted. Submitted bounds are saved exactly. The stored description and source-template ids are kept.',
          body: updatePlanningEventBodySchema,
          response: {
            200: eventGraphResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params as PlanningEventRouteParams;
        const body = request.body as UpdatePlanningEventBody;
        const location = body.location?.trim();
        const graph = await this.planningEventManager.updateEvent({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          title: body.title,
          location: location ? location : undefined,
          start: dateFromInstantString({ value: body.start }),
          end: dateFromInstantString({ value: body.end }),
          eventTimeBlocks: body.eventTimeBlocks.map((block) => ({
            id: block.id ? EventTimeBlockId.from(block.id) : undefined,
            label: block.label,
            startTime: dateFromInstantString({ value: block.startTime }),
            endTime: dateFromInstantString({ value: block.endTime }),
          })),
        });
        return reply.send(eventGraphMapper.toResponse(graph));
      },
    );

    app.patch(
      '/cycles/:cycleId/events/:eventId/details',
      {
        schema: {
          tags: ['planning'],
          operationId: 'updatePlanningEventDetails',
          summary: 'Edit the details of a Sent Event',
          description:
            'Change only the title and location of an Event in a Sent Cycle; omitting the location clears it. EventTimeBlocks, Shifts and Assignments are untouched and no Notification is created. Past Cycles are read-only.',
          body: updatePlanningEventDetailsBodySchema,
          response: {
            200: eventGraphResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params as PlanningEventRouteParams;
        const body = request.body as UpdatePlanningEventDetailsBody;
        const location = body.location?.trim();
        const graph = await this.planningEventManager.updateEventDetails({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
          title: body.title,
          location: location ? location : undefined,
        });
        return reply.send(eventGraphMapper.toResponse(graph));
      },
    );

    app.delete(
      '/cycles/:cycleId/events/:eventId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'deletePlanningEvent',
          summary: 'Delete a Draft Event',
          description:
            'Hard-delete an unsent Draft Event of a Draft Cycle with its draft calendar and participation data. No Notification is created.',
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params as PlanningEventRouteParams;
        await this.planningEventManager.deleteEvent({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
        });
        return reply.status(204).send();
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/cancel',
      {
        schema: {
          tags: ['planning'],
          operationId: 'cancelPlanningEvent',
          summary: 'Cancel an Event',
          description: 'Cancel an Event within its Cycle.',
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params as PlanningEventRouteParams;
        await this.planningEventManager.cancelEvent({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          eventId: EventId.from(eventId),
        });
        return reply.status(204).send();
      },
    );

    app.post(
      '/cycles/:cycleId/events/:eventId/event-time-blocks',
      {
        schema: {
          tags: ['planning'],
          operationId: 'createPlanningEventTimeBlock',
          summary: 'Create a EventTimeBlock on an Event',
          description: 'Create a church-level EventTimeBlock within an Event.',
          body: createEventTimeBlockBodySchema,
          response: {
            201: eventTimeBlockResponseSchema,
            404: notFoundResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params as PlanningEventRouteParams;
        const body = request.body as z.infer<
          typeof createEventTimeBlockBodySchema
        >;
        const eventTimeBlock = await this.withNestedNotFound({
          request,
          reply,
          operation: () =>
            this.planningEventManager.createEventTimeBlock({
              churchId: ChurchId.from(request.churchId),
              cycleId: CycleId.from(cycleId),
              eventId: EventId.from(eventId),
              startTime: dateFromInstantString({ value: body.startTime }),
              endTime: dateFromInstantString({ value: body.endTime }),
              label: body.label,
            }),
        });
        if (!eventTimeBlock) return;
        return reply
          .status(201)
          .send(eventTimeBlockMapper.toResponse(eventTimeBlock));
      },
    );

    app.patch(
      '/cycles/:cycleId/events/:eventId/event-time-blocks/:eventTimeBlockId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'updatePlanningEventTimeBlock',
          summary: 'Update a EventTimeBlock',
          description: "Update a EventTimeBlock's bounds or label.",
          body: updateEventTimeBlockBodySchema,
          response: {
            200: eventTimeBlockResponseSchema,
            404: notFoundResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId, eventTimeBlockId } =
          request.params as PlanningEventTimeBlockRouteParams;
        const body = request.body as z.infer<
          typeof updateEventTimeBlockBodySchema
        >;
        const eventTimeBlock = await this.withNestedNotFound({
          request,
          reply,
          operation: () =>
            this.planningEventManager.updateEventTimeBlock({
              churchId: ChurchId.from(request.churchId),
              cycleId: CycleId.from(cycleId),
              eventId: EventId.from(eventId),
              eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockId),
              startTime: optionalDateFromInstantString({
                value: body.startTime,
              }),
              endTime: optionalDateFromInstantString({ value: body.endTime }),
              label: body.label,
            }),
        });
        if (!eventTimeBlock) return;
        return reply.send(eventTimeBlockMapper.toResponse(eventTimeBlock));
      },
    );

    app.delete(
      '/cycles/:cycleId/events/:eventId/event-time-blocks/:eventTimeBlockId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'deletePlanningEventTimeBlock',
          summary: 'Delete a EventTimeBlock',
          description: 'Delete a EventTimeBlock from an Event.',
          response: { 204: z.null(), 404: notFoundResponseSchema },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId, eventTimeBlockId } =
          request.params as PlanningEventTimeBlockRouteParams;
        const deleted = await this.withNestedNotFound({
          request,
          reply,
          operation: async () => {
            await this.planningEventManager.deleteEventTimeBlock({
              churchId: ChurchId.from(request.churchId),
              cycleId: CycleId.from(cycleId),
              eventId: EventId.from(eventId),
              eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockId),
            });
            return true;
          },
        });
        if (!deleted) return;
        return reply.status(204).send();
      },
    );

    app.patch(
      '/ministries/:ministryId/default-direction',
      {
        schema: {
          tags: ['planning'],
          operationId: 'setMinistryDefaultDirection',
          summary: "Set a Ministry's default direction",
          description:
            "Set a Ministry's defaultDirection (all-in or all-out), deciding whether it starts opted into every EventTimeBlock of a cycle by default.",
          body: setDefaultDirectionBodySchema,
          response: { 200: ministryResponseSchema },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params as MinistryRouteParams;
        const body = request.body as SetDefaultDirectionBody;
        const ministry = await this.ministryManager.setDefaultDirection({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          defaultDirection: body.defaultDirection,
        });
        return reply.send(ministryMapper.toResponse(ministry));
      },
    );
  }

  private async withNestedNotFound<T>({
    request,
    reply,
    operation,
  }: NestedObjectOperationInput<T>): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof NotFoundError) {
        refuse({ reply, request, code: 'NOT_FOUND' });
        return undefined;
      }
      throw error;
    }
  }
}
