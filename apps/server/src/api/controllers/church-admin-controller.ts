import 'reflect-metadata';
import { auth } from '@church/auth';
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
import type { IEventTemplateManager } from '../../domain/contracts/application/event-template-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { IParticipationManager } from '../../domain/contracts/application/participation-manager';
import type { IPlanningCycleManager } from '../../domain/contracts/application/planning-cycle-manager';
import type { IPlanningEventManager } from '../../domain/contracts/application/planning-event-manager';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
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
import { headersFromRequest } from '../utils/headers';

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
    @inject('IVolunteerManager')
    private readonly volunteerManager: IVolunteerManager,
    @inject('IParticipationManager')
    private readonly participationManager: IParticipationManager,
    @inject('IMinistryManager')
    private readonly ministryManager: IMinistryManager,
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

      if (!ctx.isAdmin) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Church admin role required',
        });
      }

      request.userId = session.user.id;
      request.volunteerId = ctx.volunteerId;
      request.churchId = ctx.churchId;
    });

    app.post(
      '/planning-cycles',
      {
        schema: {
          tags: ['admin'],
          operationId: 'createPlanningCycle',
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
          tags: ['admin'],
          operationId: 'listPlanningCycles',
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
          tags: ['admin'],
          operationId: 'getPlanningCycle',
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
      { schema: { tags: ['admin'], operationId: 'lockPlanningCycle' } },
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
      { schema: { tags: ['admin'], operationId: 'reopenPlanningEvent' } },
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
          tags: ['admin'],
          operationId: 'createEventTemplate',
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
          tags: ['admin'],
          operationId: 'listEventTemplates',
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
          tags: ['admin'],
          operationId: 'updateEventTemplate',
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
      { schema: { tags: ['admin'], operationId: 'deleteEventTemplate' } },
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
          tags: ['admin'],
          operationId: 'applyPlanningTemplates',
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
          tags: ['admin'],
          operationId: 'createPlanningEvent',
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
          tags: ['admin'],
          operationId: 'updatePlanningEvent',
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
      { schema: { tags: ['admin'], operationId: 'cancelPlanningEvent' } },
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
          tags: ['admin'],
          operationId: 'createPlanningEventSlot',
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
          tags: ['admin'],
          operationId: 'updatePlanningEventSlot',
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
      { schema: { tags: ['admin'], operationId: 'deletePlanningEventSlot' } },
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
          tags: ['admin'],
          operationId: 'getMinistryServingProfile',
          summary: 'getMinistryServingProfile',
          description:
            'Get the serving profile for a specific ministry, including roles and teams.',
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
          tags: ['admin'],
          operationId: 'upsertMinistryServingProfile',
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
          tags: ['admin'],
          operationId: 'setMinistryDefaultDirection',
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
