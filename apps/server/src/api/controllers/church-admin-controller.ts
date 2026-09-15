import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type { z } from 'zod';
import {
  ChurchId,
  EventId,
  EventTemplateId,
  MinistryId,
  PlanningCycleId,
  RoleId,
  TeamId,
  TimeBlockId,
  TimeSlotId,
  UserId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IEventTemplateManager } from '../../domain/contracts/application/event-template-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { IParticipationManager } from '../../domain/contracts/application/participation-manager';
import type { IPlanningCycleManager } from '../../domain/contracts/application/planning-cycle-manager';
import type { IPlanningEventManager } from '../../domain/contracts/application/planning-event-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  createEventBodySchema,
  eventMapper,
  eventResponseSchema,
} from '../dtos/event.dto';
import {
  applyTemplatesBodySchema,
  createEventTemplateBodySchema,
  eventTemplateListResponseSchema,
  eventTemplateMapper,
  eventTemplateResponseSchema,
  generatedPlanningCountsResponseSchema,
} from '../dtos/event-template.dto';
import { ministryMapper, ministryResponseSchema } from '../dtos/ministry.dto';
import {
  createPlanningCycleBodySchema,
  listPlanningCyclesQuerySchema,
  planningCycleDetailsResponseSchema,
  planningCycleListResponseSchema,
  planningCycleMapper,
  planningCycleResponseSchema,
} from '../dtos/planning-cycle.dto';
import {
  type SetDefaultDirectionBody,
  servingProfileMapper,
  servingProfileResponseSchema,
  setDefaultDirectionBodySchema,
  type UpsertServingProfileBody,
  upsertServingProfileBodySchema,
} from '../dtos/serving-profile.dto';
import {
  createSlotBodySchema,
  timeSlotMapper,
  timeSlotResponseSchema,
  updateSlotBodySchema,
} from '../dtos/time-slot.dto';

interface PlanningCycleRouteParams {
  cycleId: string;
}

interface EventTemplateRouteParams {
  templateId: string;
}

interface PlanningEventRouteParams {
  cycleId: string;
  eventId: string;
}

interface PlanningEventSlotRouteParams {
  cycleId: string;
  eventId: string;
  slotId: string;
}

interface MinistryRouteParams {
  ministryId: string;
}

const manualPlanningEventBodySchema = createEventBodySchema.omit({
  ministryId: true,
});

const updatePlanningEventBodySchema = manualPlanningEventBodySchema.partial();

type ManualPlanningEventBody = z.infer<typeof manualPlanningEventBodySchema>;
type UpdatePlanningEventBody = z.infer<typeof updatePlanningEventBodySchema>;

@injectable()
export class ChurchAdminController implements FastifyController {
  readonly prefix = '/admin';

  constructor(
    @inject('IPlanningCycleManager')
    private readonly planningCycleManager: IPlanningCycleManager,
    @inject('IEventTemplateManager')
    private readonly eventTemplateManager: IEventTemplateManager,
    @inject('IPlanningEventManager')
    private readonly planningEventManager: IPlanningEventManager,
    @inject('IActiveChurchResolver')
    private readonly activeChurchResolver: IActiveChurchResolver,
    @inject('IParticipationManager')
    private readonly participationManager: IParticipationManager,
    @inject('IMinistryManager')
    private readonly ministryManager: IMinistryManager,
    @inject('AuthorityGuard')
    private readonly authorityGuard: AuthorityGuard,
  ) {}

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
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Church admin role required',
        });
      }
    });

    app.post(
      '/planning-cycles',
      {
        schema: {
          tags: ['planning'],
          operationId: 'createPlanningCycle',
          summary: 'Create a PlanningCycle',
          description:
            'Create a new PlanningCycle spanning a CalendarDay range for the Church.',
          body: createPlanningCycleBodySchema,
          response: { 201: planningCycleResponseSchema },
        },
      },
      async (request, reply) => {
        const body = request.body as z.infer<
          typeof createPlanningCycleBodySchema
        >;
        const cycle = await this.planningCycleManager.createCycle({
          churchId: ChurchId.from(request.churchId),
          name: body.name,
          startDate: new Date(`${body.startDate}T00:00:00.000Z`),
          endDate: new Date(`${body.endDate}T00:00:00.000Z`),
        });
        return reply.status(201).send(planningCycleMapper.toResponse(cycle));
      },
    );

    app.get(
      '/planning-cycles',
      {
        schema: {
          tags: ['planning'],
          operationId: 'listPlanningCycles',
          summary: 'List PlanningCycles',
          description:
            'List the Church PlanningCycles, optionally filtered by state.',
          query: listPlanningCyclesQuerySchema,
          response: { 200: planningCycleListResponseSchema },
        },
      },
      async (request, reply) => {
        const query = request.query as z.infer<
          typeof listPlanningCyclesQuerySchema
        >;
        const cycles = await this.planningCycleManager.listCycles({
          churchId: ChurchId.from(request.churchId),
          state: query.state,
        });
        return reply.send(planningCycleMapper.listToResponse(cycles));
      },
    );

    app.get(
      '/planning-cycles/:cycleId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'getPlanningCycle',
          summary: 'Get a PlanningCycle',
          description: 'Get the details of a single PlanningCycle.',
          response: { 200: planningCycleDetailsResponseSchema },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as PlanningCycleRouteParams;
        const details = await this.planningCycleManager.getCycle({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
        });
        return reply.send(planningCycleMapper.detailsToResponse(details));
      },
    );

    app.post(
      '/planning-cycles/:cycleId/lock',
      {
        schema: {
          tags: ['planning'],
          operationId: 'lockPlanningCycle',
          summary: 'Lock a PlanningCycle',
          description:
            'Lock a PlanningCycle, transitioning its Events from draft to scheduled.',
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as PlanningCycleRouteParams;
        await this.planningCycleManager.lockCycle({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
        });
        return reply.status(204).send();
      },
    );

    app.post(
      '/planning-cycles/:cycleId/events/:eventId/reopen',
      {
        schema: {
          tags: ['planning'],
          operationId: 'reopenPlanningEvent',
          summary: 'Reopen an Event for editing',
          description:
            'Move a scheduled Event in a locked PlanningCycle back to draft so it can be edited.',
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params as PlanningEventRouteParams;
        await this.planningCycleManager.reopenEvent({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
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
            'Create a church-owned EventTemplate with its ordered TimeBlocks for a given weekday.',
          body: createEventTemplateBodySchema,
          response: { 201: eventTemplateResponseSchema },
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

    app.patch(
      '/event-templates/:templateId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'updateEventTemplate',
          summary: 'Update an EventTemplate',
          description:
            "Replace an EventTemplate's name, weekday, and TimeBlocks.",
          body: createEventTemplateBodySchema,
          response: { 200: eventTemplateResponseSchema },
        },
      },
      async (request, reply) => {
        const { templateId } = request.params as EventTemplateRouteParams;
        const body = request.body as z.infer<
          typeof createEventTemplateBodySchema
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
      '/planning-cycles/:cycleId/apply-templates',
      {
        schema: {
          tags: ['planning'],
          operationId: 'applyPlanningTemplates',
          summary: 'Apply EventTemplates to a PlanningCycle',
          description:
            'Generate one Event per matching CalendarDay in the PlanningCycle for each selected EventTemplate, with one TimeSlot per TimeBlock.',
          body: applyTemplatesBodySchema,
          response: { 201: generatedPlanningCountsResponseSchema },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as PlanningCycleRouteParams;
        const body = request.body as z.infer<typeof applyTemplatesBodySchema>;
        const result = await this.planningEventManager.generateFromTemplates({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
          templateIds: body.templateIds.map(EventTemplateId.from),
        });
        return reply.status(201).send(result);
      },
    );

    app.post(
      '/planning-cycles/:cycleId/events',
      {
        schema: {
          tags: ['planning'],
          operationId: 'createPlanningEvent',
          summary: 'Create a manual Event',
          description:
            'Create a one-off Event within a PlanningCycle without using an EventTemplate.',
          body: manualPlanningEventBodySchema,
          response: { 201: eventResponseSchema },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as PlanningCycleRouteParams;
        const body = request.body as ManualPlanningEventBody;
        const event = await this.planningEventManager.createEvent({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
          title: body.title,
          description: body.description,
          location: body.location,
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate),
          eventType: body.eventType,
        });
        return reply.status(201).send(eventMapper.toResponse(event));
      },
    );

    app.patch(
      '/planning-cycles/:cycleId/events/:eventId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'updatePlanningEvent',
          summary: 'Update an Event',
          description:
            "Update an Event's title, description, location, or scheduled Instants.",
          body: updatePlanningEventBodySchema,
          response: { 200: eventResponseSchema },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params as PlanningEventRouteParams;
        const body = request.body as UpdatePlanningEventBody;
        const event = await this.planningEventManager.updateEvent({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
          eventId: EventId.from(eventId),
          title: body.title,
          description: body.description,
          location: body.location,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
        });
        return reply.send(eventMapper.toResponse(event));
      },
    );

    app.post(
      '/planning-cycles/:cycleId/events/:eventId/cancel',
      {
        schema: {
          tags: ['planning'],
          operationId: 'cancelPlanningEvent',
          summary: 'Cancel an Event',
          description: 'Cancel an Event within its PlanningCycle.',
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params as PlanningEventRouteParams;
        await this.planningEventManager.cancelEvent({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
          eventId: EventId.from(eventId),
        });
        return reply.status(204).send();
      },
    );

    app.post(
      '/planning-cycles/:cycleId/events/:eventId/slots',
      {
        schema: {
          tags: ['planning'],
          operationId: 'createPlanningEventSlot',
          summary: 'Create a TimeSlot on an Event',
          description: 'Create a church-level TimeSlot within an Event.',
          body: createSlotBodySchema,
          response: { 201: timeSlotResponseSchema },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId } = request.params as PlanningEventRouteParams;
        const body = request.body as z.infer<typeof createSlotBodySchema>;
        const slot = await this.planningEventManager.createSlot({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
          eventId: EventId.from(eventId),
          startTime: new Date(body.startTime),
          endTime: new Date(body.endTime),
          label: body.label,
        });
        return reply.status(201).send(timeSlotMapper.toResponse(slot));
      },
    );

    app.patch(
      '/planning-cycles/:cycleId/events/:eventId/slots/:slotId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'updatePlanningEventSlot',
          summary: 'Update a TimeSlot',
          description: "Update a TimeSlot's bounds or label.",
          body: updateSlotBodySchema,
          response: { 200: timeSlotResponseSchema },
        },
      },
      async (request, reply) => {
        const { cycleId, eventId, slotId } =
          request.params as PlanningEventSlotRouteParams;
        const body = request.body as z.infer<typeof updateSlotBodySchema>;
        const slot = await this.planningEventManager.updateSlot({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
          eventId: EventId.from(eventId),
          slotId: TimeSlotId.from(slotId),
          startTime: body.startTime ? new Date(body.startTime) : undefined,
          endTime: body.endTime ? new Date(body.endTime) : undefined,
          label: body.label,
        });
        return reply.send(timeSlotMapper.toResponse(slot));
      },
    );

    app.delete(
      '/planning-cycles/:cycleId/events/:eventId/slots/:slotId',
      {
        schema: {
          tags: ['planning'],
          operationId: 'deletePlanningEventSlot',
          summary: 'Delete a TimeSlot',
          description: 'Delete a TimeSlot from an Event.',
        },
      },
      async (request, reply) => {
        const { cycleId, eventId, slotId } =
          request.params as PlanningEventSlotRouteParams;
        await this.planningEventManager.deleteSlot({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
          eventId: EventId.from(eventId),
          slotId: TimeSlotId.from(slotId),
        });
        return reply.status(204).send();
      },
    );

    app.get(
      '/ministries/:ministryId/serving-profile',
      {
        schema: {
          tags: ['planning'],
          operationId: 'getMinistryServingProfile',
          summary: "Get a Ministry's serving profile",
          description:
            "Get a Ministry's MinistryServingProfile, the standing rule declaring which EventTemplate TimeBlocks it always serves.",
          response: { 200: servingProfileResponseSchema },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params as MinistryRouteParams;
        const profiles = await this.participationManager.getServingProfile({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
        });
        return reply.send(servingProfileMapper.toResponse(profiles));
      },
    );

    app.put(
      '/ministries/:ministryId/serving-profile',
      {
        schema: {
          tags: ['planning'],
          operationId: 'upsertMinistryServingProfile',
          summary: "Set a Ministry's serving profile",
          description:
            "Replace a Ministry's MinistryServingProfile entries, including which TimeBlocks it serves, its Shift split, and headcounts.",
          body: upsertServingProfileBodySchema,
          response: { 200: servingProfileResponseSchema },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params as MinistryRouteParams;
        const body = request.body as UpsertServingProfileBody;
        const profiles = await this.participationManager.upsertServingProfile({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          entries: body.entries.map((entry) => ({
            sourceTemplateBlockId: TimeBlockId.from(
              entry.sourceTemplateBlockId,
            ),
            serves: entry.serves,
            shiftSplit: entry.shiftSplit,
            headcounts: entry.headcounts.map((headcount) => ({
              roleId: RoleId.from(headcount.roleId),
              teamId: headcount.teamId
                ? TeamId.from(headcount.teamId)
                : undefined,
              count: headcount.count,
            })),
          })),
        });
        return reply.send(servingProfileMapper.toResponse(profiles));
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
            "Set a Ministry's defaultDirection (all-in or all-out), deciding whether it starts opted into every TimeSlot of a cycle by default.",
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
}
