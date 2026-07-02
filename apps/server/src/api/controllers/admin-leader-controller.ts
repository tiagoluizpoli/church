import 'reflect-metadata';
import { auth } from '@church/auth';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import {
  AssignmentId,
  ChurchId,
  EventId,
  MinistryId,
  RoleId,
  RoleTemplateId,
  TeamId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { IAssignmentManager } from '../../domain/contracts/application/assignment-manager';
import type { IEventManager } from '../../domain/contracts/application/event-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { IRoleManager } from '../../domain/contracts/application/role-manager';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  assignmentMapper,
  assignmentResponseSchema,
  auditListResponseSchema,
  createAssignmentBodySchema,
  overrideAssignmentBodySchema,
} from '../dtos/assignment.dto';
import {
  createEventBodySchema,
  eventListResponseSchema,
  eventMapper,
  eventResponseSchema,
  listEventsQuerySchema,
  scheduleBuilderDataResponseSchema,
} from '../dtos/event.dto';
import {
  ministryListResponseSchema,
  ministryMapper,
} from '../dtos/ministry.dto';
import {
  roleTemplateListResponseSchema,
  roleTemplateMapper,
  roleTemplateResponseSchema,
  upsertRoleTemplateBodySchema,
} from '../dtos/role.dto';
import {
  createSlotBodySchema,
  generateSlotsBodySchema,
  slotRequirementBodySchema,
  slotRequirementResponseSchema,
  timeSlotListResponseSchema,
  timeSlotMapper,
  timeSlotResponseSchema,
  updateSlotBodySchema,
} from '../dtos/time-slot.dto';
import { headersFromRequest } from '../utils/headers';

@injectable()
export class AdminLeaderController implements FastifyController {
  readonly prefix = '/admin';

  constructor(
    @inject('IMinistryManager')
    private readonly ministryManager: IMinistryManager,
    @inject('IEventManager')
    private readonly eventManager: IEventManager,
    @inject('IAssignmentManager')
    private readonly assignmentManager: IAssignmentManager,
    @inject('IRoleManager')
    private readonly roleManager: IRoleManager,
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

      const isScheduleBuilderRoute =
        request.method === 'GET' &&
        request.url.startsWith('/api/v1/admin/schedule-builder');
      if (!ctx.isAdmin && !ctx.isLeader && !isScheduleBuilderRoute) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Admin or leader role required',
        });
      }

      request.userId = session.user.id;
      request.volunteerId = ctx.volunteerId;
      request.churchId = ctx.churchId;
    });

    // Ministry routes
    app.get(
      '/ministries',
      {
        schema: {
          tags: ['admin'],
          operationId: 'listMinistries',
          response: { 200: ministryListResponseSchema },
        },
      },
      async (request, reply) => {
        const ministries = await this.ministryManager.listByLeader({
          leaderId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(ministryMapper.toResponseList(ministries));
      },
    );

    // Schedule builder
    app.get(
      '/schedule-builder',
      {
        schema: {
          tags: ['admin'],
          operationId: 'getScheduleBuilderData',
          query: z.object({ eventId: z.string() }),
          response: { 200: scheduleBuilderDataResponseSchema },
        },
      },
      async (request, reply) => {
        const { eventId } = request.query as { eventId: string };
        const data = await this.eventManager.getScheduleBuilderData({
          churchId: ChurchId.from(request.churchId),
          eventId: EventId.from(eventId),
          volunteerId: VolunteerId.from(request.volunteerId),
        });
        return reply.send(eventMapper.scheduleBuilderToResponse(data));
      },
    );

    // Event routes
    app.get(
      '/events',
      {
        schema: {
          tags: ['admin'],
          operationId: 'listEvents',
          query: listEventsQuerySchema,
          response: { 200: eventListResponseSchema },
        },
      },
      async (request, reply) => {
        const { ministryId, status } = request.query as {
          ministryId: string;
          status?: string;
        };
        const events = await this.eventManager.listEvents({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          status: status as
            | import('../../domain/entities/event').EventStatus
            | undefined,
        });
        return reply.send(eventMapper.listToResponse(events));
      },
    );

    app.post(
      '/events',
      {
        schema: {
          tags: ['admin'],
          operationId: 'createEvent',
          body: createEventBodySchema,
          response: { 201: eventResponseSchema },
        },
      },
      async (request, reply) => {
        const body = request.body as z.infer<typeof createEventBodySchema>;
        const ev = await this.eventManager.createEvent({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(body.ministryId),
          title: body.title,
          description: body.description,
          location: body.location,
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate),
          eventType: body.eventType,
        });
        return reply.status(201).send(eventMapper.toResponse(ev));
      },
    );

    app.post(
      '/events/:eventId/publish',
      { schema: { tags: ['admin'], operationId: 'publishEvent' } },
      async (request, reply) => {
        const { eventId } = request.params as { eventId: string };
        await this.eventManager.publishEvent({
          eventId: EventId.from(eventId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(201).send({ published: true });
      },
    );

    app.post(
      '/events/:eventId/cancel',
      { schema: { tags: ['admin'], operationId: 'cancelEvent' } },
      async (request, reply) => {
        const { eventId } = request.params as { eventId: string };
        await this.eventManager.cancelEvent({
          eventId: EventId.from(eventId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(201).send({ cancelled: true });
      },
    );

    app.post(
      '/events/:eventId/reminders',
      { schema: { tags: ['admin'], operationId: 'sendReminders' } },
      async (request, reply) => {
        const { eventId } = request.params as { eventId: string };
        await this.eventManager.sendReminder({
          eventId: EventId.from(eventId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(201).send({ sent: true });
      },
    );

    app.post(
      '/events/:eventId/apply-template',
      {
        schema: {
          tags: ['admin'],
          operationId: 'applyRoleTemplate',
          body: z.object({ templateId: z.string() }),
          response: { 201: z.object({ applied: z.literal(true) }) },
        },
      },
      async (request, reply) => {
        const { eventId } = request.params as { eventId: string };
        const body = request.body as { templateId: string };
        await this.roleManager.applyTemplate({
          churchId: ChurchId.from(request.churchId),
          eventId: EventId.from(eventId),
          templateId: RoleTemplateId.from(body.templateId),
        });
        return reply.status(201).send({ applied: true });
      },
    );

    // Slot routes
    app.post(
      '/events/:eventId/slots',
      {
        schema: {
          tags: ['admin'],
          operationId: 'createSlot',
          body: createSlotBodySchema,
          response: { 201: timeSlotResponseSchema },
        },
      },
      async (request, reply) => {
        const { eventId } = request.params as { eventId: string };
        const body = request.body as z.infer<typeof createSlotBodySchema>;
        const slot = await this.eventManager.createSlot({
          churchId: ChurchId.from(request.churchId),
          eventId: EventId.from(eventId),
          startTime: new Date(body.startTime),
          endTime: new Date(body.endTime),
          label: body.label,
        });
        return reply.status(201).send(timeSlotMapper.toResponse(slot));
      },
    );

    app.patch(
      '/events/:eventId/slots/:slotId',
      {
        schema: {
          tags: ['admin'],
          operationId: 'updateSlot',
          body: updateSlotBodySchema,
          response: { 200: timeSlotResponseSchema },
        },
      },
      async (request, reply) => {
        const { slotId } = request.params as {
          eventId: string;
          slotId: string;
        };
        const body = request.body as z.infer<typeof updateSlotBodySchema>;
        const slot = await this.eventManager.updateSlot({
          churchId: ChurchId.from(request.churchId),
          slotId: TimeSlotId.from(slotId),
          startTime: body.startTime ? new Date(body.startTime) : undefined,
          endTime: body.endTime ? new Date(body.endTime) : undefined,
          label: body.label,
        });
        return reply.send(timeSlotMapper.toResponse(slot));
      },
    );

    app.delete(
      '/events/:eventId/slots/:slotId',
      { schema: { tags: ['admin'], operationId: 'deleteSlot' } },
      async (request, reply) => {
        const { slotId } = request.params as {
          eventId: string;
          slotId: string;
        };
        await this.eventManager.deleteSlot({
          slotId: TimeSlotId.from(slotId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(204).send();
      },
    );

    app.post(
      '/assignments/:assignmentId/override',
      {
        schema: {
          tags: ['admin'],
          operationId: 'overrideAssignment',
          body: overrideAssignmentBodySchema,
          response: { 201: z.object({ overridden: z.literal(true) }) },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as { assignmentId: string };
        const body = request.body as z.infer<
          typeof overrideAssignmentBodySchema
        >;
        await this.assignmentManager.overrideAssignment({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: ChurchId.from(request.churchId),
          actorId: UserId.from(request.userId),
          reason: body.reason,
        });
        return reply.status(201).send({ overridden: true });
      },
    );

    app.post(
      '/events/:eventId/slots/generate',
      {
        schema: {
          tags: ['admin'],
          operationId: 'generateSlots',
          body: generateSlotsBodySchema,
          response: { 201: timeSlotListResponseSchema },
        },
      },
      async (request, reply) => {
        const { eventId } = request.params as { eventId: string };
        const body = request.body as z.infer<typeof generateSlotsBodySchema>;

        const strategy =
          body.strategy.kind === 'equal-split'
            ? body.strategy
            : {
                kind: 'template-based' as const,
                periods: body.strategy.periods.map((p) => ({
                  label: p.label,
                  startTime: new Date(p.startTime),
                  endTime: new Date(p.endTime),
                  requirements: p.requirements,
                })),
              };

        const slots = await this.eventManager.generateSlots({
          churchId: ChurchId.from(request.churchId),
          eventId: EventId.from(eventId),
          strategy,
        });
        return reply.status(201).send(timeSlotMapper.listToResponse(slots));
      },
    );

    app.put(
      '/events/:eventId/slots/:slotId/requirements',
      {
        schema: {
          tags: ['admin'],
          operationId: 'upsertSlotRequirement',
          body: slotRequirementBodySchema,
          response: { 200: slotRequirementResponseSchema },
        },
      },
      async (request, reply) => {
        const { slotId } = request.params as {
          eventId: string;
          slotId: string;
        };
        const body = request.body as z.infer<typeof slotRequirementBodySchema>;
        const req = await this.eventManager.upsertSlotRequirement({
          churchId: ChurchId.from(request.churchId),
          slotId: TimeSlotId.from(slotId),
          roleId: RoleId.from(body.roleId),
          teamId: body.teamId ? TeamId.from(body.teamId) : undefined,
          requiredCount: body.requiredCount,
          notes: body.notes,
        });
        return reply.send(timeSlotMapper.requirementToResponse(req));
      },
    );

    // Assignment routes
    app.post(
      '/assignments',
      {
        schema: {
          tags: ['admin'],
          operationId: 'createAssignment',
          body: createAssignmentBodySchema,
          response: { 201: assignmentResponseSchema },
        },
      },
      async (request, reply) => {
        const body = request.body as z.infer<typeof createAssignmentBodySchema>;
        const result = await this.assignmentManager.createAssignment({
          churchId: ChurchId.from(request.churchId),
          slotId: TimeSlotId.from(body.slotId),
          volunteerId: VolunteerId.from(body.volunteerId),
          roleId: RoleId.from(body.roleId),
          actorId: UserId.from(request.userId),
          reason: body.reason,
        });
        return reply.status(201).send(assignmentMapper.toResponse(result));
      },
    );

    app.delete(
      '/assignments/:assignmentId',
      { schema: { tags: ['admin'], operationId: 'deleteAssignment' } },
      async (request, reply) => {
        const { assignmentId } = request.params as { assignmentId: string };
        await this.assignmentManager.deleteAssignment({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(204).send();
      },
    );

    app.get(
      '/assignments/:assignmentId/audit',
      {
        schema: {
          tags: ['admin'],
          operationId: 'getAssignmentAudit',
          response: { 200: auditListResponseSchema },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as { assignmentId: string };
        const items = await this.assignmentManager.listAuditLog({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(assignmentMapper.auditListToResponse(items));
      },
    );

    // Role template routes
    app.get(
      '/role-templates',
      {
        schema: {
          tags: ['admin'],
          operationId: 'listRoleTemplates',
          response: { 200: roleTemplateListResponseSchema },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.query as { ministryId: string };
        const templates = await this.roleManager.listTemplates({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
        });
        return reply.send(roleTemplateMapper.listToResponse(templates));
      },
    );

    app.put(
      '/role-templates/:templateId',
      {
        schema: {
          tags: ['admin'],
          operationId: 'upsertRoleTemplate',
          body: upsertRoleTemplateBodySchema,
          response: { 200: roleTemplateResponseSchema },
        },
      },
      async (request, reply) => {
        const { templateId } = request.params as { templateId: string };
        const body = request.body as z.infer<
          typeof upsertRoleTemplateBodySchema
        >;
        const template = await this.roleManager.upsertTemplate({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(body.ministryId),
          templateId: RoleTemplateId.from(templateId),
          name: body.name,
          items: body.items.map((i) => ({
            roleId: RoleId.from(i.roleId),
            requiredCount: i.requiredCount,
          })),
        });
        return reply.send(roleTemplateMapper.toResponse(template));
      },
    );

    app.delete(
      '/role-templates/:templateId',
      { schema: { tags: ['admin'], operationId: 'deleteRoleTemplate' } },
      async (request, reply) => {
        const { templateId } = request.params as { templateId: string };
        await this.roleManager.deleteTemplate({
          templateId: RoleTemplateId.from(templateId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(204).send();
      },
    );
  }
}
