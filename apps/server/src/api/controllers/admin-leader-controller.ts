import 'reflect-metadata';
import { auth } from '@church/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
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
import type { AuthorityGuard } from '../auth/authority-guard';
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

interface DenySchedulingAccessInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

interface DenyMinistryScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  ministryId: string;
}

interface DenyEventScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  eventId: string;
}

interface DenyEventSlotScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  slotId: string;
}

interface DenyAssignmentScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
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
    @inject('AuthorityGuard')
    private readonly authorityGuard: AuthorityGuard,
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
        const denied = await this.denySchedulingAccess({ request, reply });
        if (denied) return;

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
        const denied = await this.denyMinistryScope({
          request,
          reply,
          ministryId,
        });
        if (denied) return;

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
        const denied = await this.denyEventScope({ request, reply, eventId });
        if (denied) return;

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
        const denied = await this.denyEventScope({ request, reply, eventId });
        if (denied) return;

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
        const denied = await this.denyEventScope({ request, reply, eventId });
        if (denied) return;

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
        const { eventId, slotId } = request.params as EventSlotRouteParams;
        const denied = await this.denyEventScope({ request, reply, eventId });
        if (denied) return;

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
        const { eventId, slotId } = request.params as EventSlotRouteParams;
        const denied = await this.denyEventScope({ request, reply, eventId });
        if (denied) return;

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
        const denied = await this.denyAssignmentScope({
          request,
          reply,
          assignmentId,
        });
        if (denied) return;

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
        const denied = await this.denyEventScope({ request, reply, eventId });
        if (denied) return;

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
        const { eventId, slotId } = request.params as EventSlotRouteParams;
        const denied = await this.denyEventScope({ request, reply, eventId });
        if (denied) return;

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
        const denied = await this.denyEventSlotScope({
          request,
          reply,
          slotId: body.slotId,
        });
        if (denied) return;

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
        const denied = await this.denyAssignmentScope({
          request,
          reply,
          assignmentId,
        });
        if (denied) return;

        await this.assignmentManager.deleteAssignment({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: ChurchId.from(request.churchId),
          actorId: UserId.from(request.userId),
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
        const denied = await this.denyAssignmentScope({
          request,
          reply,
          assignmentId,
        });
        if (denied) return;

        const items = await this.assignmentManager.listAuditLog({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(assignmentMapper.auditListToResponse(items));
      },
    );
  }

  /**
   * Returns whether access was denied. `FastifyReply` is a thenable (it
   * resolves once the response is flushed) — `return reply.send(...)` from
   * an `async` method would have its own returned promise silently adopt
   * that reply's resolution instead of the reply object itself, so callers
   * must never `await` a reply and branch on the awaited value. Each guard
   * here sends the 403 as a side effect and returns a plain boolean.
   *
   * Gates the frontend's nav-visibility probe (`useCallerRoles`): there is
   * no "my roles" endpoint, so the caller derives whether it may see
   * Scheduling nav from whether this lightweight query is forbidden.
   */
  private async denySchedulingAccess({
    request,
    reply,
  }: DenySchedulingAccessInput): Promise<boolean> {
    const allowed = await this.authorityGuard.hasSchedulingAccess({
      churchId: ChurchId.from(request.churchId),
      userId: UserId.from(request.userId),
    });
    if (allowed) return false;

    reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Admin or leader role required',
    });
    return true;
  }

  private async denyMinistryScope({
    request,
    reply,
    ministryId,
  }: DenyMinistryScopeInput): Promise<boolean> {
    const allowed = await this.authorityGuard.canManageMinistry({
      churchId: ChurchId.from(request.churchId),
      ministryId: MinistryId.from(ministryId),
      userId: UserId.from(request.userId),
    });
    if (allowed) return false;

    reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Not a leader of this ministry',
    });
    return true;
  }

  private async denyEventScope({
    request,
    reply,
    eventId,
  }: DenyEventScopeInput): Promise<boolean> {
    const allowed = await this.authorityGuard.canManageEvent({
      churchId: ChurchId.from(request.churchId),
      eventId: EventId.from(eventId),
      userId: UserId.from(request.userId),
    });
    if (allowed) return false;

    reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Not a leader of this event',
    });
    return true;
  }

  private async denyEventSlotScope({
    request,
    reply,
    slotId,
  }: DenyEventSlotScopeInput): Promise<boolean> {
    const allowed = await this.authorityGuard.canManageEventSlot({
      churchId: ChurchId.from(request.churchId),
      slotId: TimeSlotId.from(slotId),
      userId: UserId.from(request.userId),
    });
    if (allowed) return false;

    reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Slot belongs to another ministry',
    });
    return true;
  }

  private async denyAssignmentScope({
    request,
    reply,
    assignmentId,
  }: DenyAssignmentScopeInput): Promise<boolean> {
    const assignment = await this.assignmentManager.getAssignment({
      churchId: ChurchId.from(request.churchId),
      assignmentId: AssignmentId.from(assignmentId),
    });
    const { shiftId } = assignment;
    const allowed =
      shiftId != null &&
      (await this.authorityGuard.canManageShift({
        churchId: ChurchId.from(request.churchId),
        shiftId,
        userId: UserId.from(request.userId),
      }));
    if (allowed) return false;

    reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Assignment belongs to another ministry',
    });
    return true;
  }
}
