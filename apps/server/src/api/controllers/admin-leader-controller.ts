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
  TeamId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { IAssignmentManager } from '../../domain/contracts/application/assignment-manager';
import type { IEventManager } from '../../domain/contracts/application/event-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
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
  eventListResponseSchema,
  eventMapper,
  listEventsQuerySchema,
  scheduleBuilderDataResponseSchema,
} from '../dtos/event.dto';
import {
  ministryListResponseSchema,
  ministryMapper,
} from '../dtos/ministry.dto';
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

interface ScheduleBuilderQuery {
  eventId: string;
  ministryId?: string;
}

interface ListEventsQuery {
  ministryId: string;
  status?: string;
}

interface EventRouteParams {
  eventId: string;
}

interface EventSlotRouteParams {
  eventId: string;
  slotId: string;
}

interface AssignmentRouteParams {
  assignmentId: string;
}

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
          query: z.object({
            eventId: z.string(),
            ministryId: z.string().optional(),
          }),
          response: { 200: scheduleBuilderDataResponseSchema },
        },
      },
      async (request, reply) => {
        const { eventId, ministryId } = request.query as ScheduleBuilderQuery;
        const data = await this.eventManager.getScheduleBuilderData({
          churchId: ChurchId.from(request.churchId),
          eventId: EventId.from(eventId),
          volunteerId: VolunteerId.from(request.volunteerId),
          ministryId: ministryId ? MinistryId.from(ministryId) : undefined,
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
        const { ministryId, status } = request.query as ListEventsQuery;
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
      '/events/:eventId/cancel',
      { schema: { tags: ['admin'], operationId: 'cancelEvent' } },
      async (request, reply) => {
        const { eventId } = request.params as EventRouteParams;
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
        const { eventId } = request.params as EventRouteParams;
        await this.eventManager.sendReminder({
          eventId: EventId.from(eventId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(201).send({ sent: true });
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
        const { eventId } = request.params as EventRouteParams;
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
        const { slotId } = request.params as EventSlotRouteParams;
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
        const { slotId } = request.params as EventSlotRouteParams;
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
        const { assignmentId } = request.params as AssignmentRouteParams;
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
        const { eventId } = request.params as EventRouteParams;
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
        const { slotId } = request.params as EventSlotRouteParams;
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
        const { assignmentId } = request.params as AssignmentRouteParams;
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
        const { assignmentId } = request.params as AssignmentRouteParams;
        const items = await this.assignmentManager.listAuditLog({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(assignmentMapper.auditListToResponse(items));
      },
    );
  }
}
