import 'reflect-metadata';
import { auth } from '@church/auth';
import { inject, injectable } from 'tsyringe';
import type { VolunteerRepository } from '../../application/contracts/volunteer.repository';
import type { IAssignmentManager } from '../../domain/contracts/assignment-manager';
import type { IEventManager } from '../../domain/contracts/event-manager';
import type { IMinistryManager } from '../../domain/contracts/ministry-manager';
import type { IRoleManager } from '../../domain/contracts/role-manager';
import type { AssignmentId } from '../../domain/entities/assignment';
import type { ChurchId } from '../../domain/entities/church';
import type { EventId } from '../../domain/entities/event';
import type { MinistryId } from '../../domain/entities/ministry';
import type { RoleId } from '../../domain/entities/role';
import type { RoleTemplateId } from '../../domain/entities/role-template';
import type { TeamId } from '../../domain/entities/team';
import type { TimeSlotId } from '../../domain/entities/time-slot';
import type { UserId, VolunteerId } from '../../domain/entities/volunteer';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  assignmentMapper,
  assignmentResponseSchema,
  auditListResponseSchema,
  createAssignmentBodySchema,
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
    @inject('IVolunteerRepository')
    private readonly volunteerRepo: VolunteerRepository,
  ) {}

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook('preValidation', async (request, reply) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value)
          headers.set(key, Array.isArray(value) ? (value[0] ?? '') : value);
      }

      const session = await auth.api.getSession({ headers }).catch(() => null);
      if (!session?.user) {
        return reply
          .status(401)
          .send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const volunteer = await this.volunteerRepo.findByUserIdGlobally(
        session.user.id as UserId,
      );
      if (!volunteer) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'Volunteer profile not found',
        });
      }

      const ledMinistries = await this.volunteerRepo.listLedMinistries(
        volunteer.churchId,
        volunteer.id,
      );
      const isAdmin = ledMinistries.some(
        (lm) => lm.ministryName === 'Administration',
      );
      const isLeader = ledMinistries.length > 0;

      if (!isAdmin && !isLeader) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Admin or leader role required',
        });
      }

      request.volunteerId = volunteer.id as string;
      request.churchId = volunteer.churchId as string;
    });

    // Ministry routes
    app.get(
      '/ministries',
      { schema: { response: { 200: ministryListResponseSchema } } },
      async (request, reply) => {
        const ministries = await this.ministryManager.listByLeader({
          leaderId: request.volunteerId as VolunteerId,
          churchId: request.churchId as ChurchId,
        });
        return reply.send(ministryMapper.toResponseList(ministries));
      },
    );

    // Schedule builder
    app.get(
      '/schedule-builder',
      { schema: { response: { 200: scheduleBuilderDataResponseSchema } } },
      async (request, reply) => {
        const { ministryId } = request.query as { ministryId: string };
        const data = await this.eventManager.getScheduleBuilderData({
          churchId: request.churchId as ChurchId,
          ministryId: ministryId as MinistryId,
        });
        return reply.send(eventMapper.scheduleBuilderToResponse(data));
      },
    );

    // Event routes
    app.get(
      '/events',
      {
        schema: {
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
          churchId: request.churchId as ChurchId,
          ministryId: ministryId as MinistryId,
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
          body: createEventBodySchema,
          response: { 201: eventResponseSchema },
        },
      },
      async (request, reply) => {
        const body = request.body as {
          ministryId: string;
          title: string;
          description?: string;
          location?: string;
          startDate: string;
          endDate: string;
          eventType?: 'hourly' | 'day_based';
        };
        const ev = await this.eventManager.createEvent({
          churchId: request.churchId as ChurchId,
          ministryId: body.ministryId as MinistryId,
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

    app.post('/events/:eventId/publish', {}, async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      await this.eventManager.publishEvent({
        eventId: eventId as EventId,
        churchId: request.churchId as ChurchId,
      });
      return reply.status(200).send({ published: true });
    });

    app.post('/events/:eventId/cancel', {}, async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      await this.eventManager.cancelEvent({
        eventId: eventId as EventId,
        churchId: request.churchId as ChurchId,
      });
      return reply.status(200).send({ cancelled: true });
    });

    app.post('/events/:eventId/reminders', {}, async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      await this.eventManager.sendReminder({
        eventId: eventId as EventId,
        churchId: request.churchId as ChurchId,
      });
      return reply.status(200).send({ sent: true });
    });

    // Slot routes
    app.post(
      '/events/:eventId/slots',
      {
        schema: {
          body: createSlotBodySchema,
          response: { 201: timeSlotResponseSchema },
        },
      },
      async (request, reply) => {
        const { eventId } = request.params as { eventId: string };
        const body = request.body as {
          startTime: string;
          endTime: string;
          label?: string;
        };
        const slot = await this.eventManager.createSlot({
          churchId: request.churchId as ChurchId,
          eventId: eventId as EventId,
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
          body: updateSlotBodySchema,
          response: { 200: timeSlotResponseSchema },
        },
      },
      async (request, reply) => {
        const { slotId } = request.params as {
          eventId: string;
          slotId: string;
        };
        const body = request.body as {
          startTime?: string;
          endTime?: string;
          label?: string;
        };
        const slot = await this.eventManager.updateSlot({
          churchId: request.churchId as ChurchId,
          slotId: slotId as TimeSlotId,
          startTime: body.startTime ? new Date(body.startTime) : undefined,
          endTime: body.endTime ? new Date(body.endTime) : undefined,
          label: body.label,
        });
        return reply.send(timeSlotMapper.toResponse(slot));
      },
    );

    app.delete('/events/:eventId/slots/:slotId', {}, async (request, reply) => {
      const { slotId } = request.params as { eventId: string; slotId: string };
      await this.eventManager.deleteSlot({
        slotId: slotId as TimeSlotId,
        churchId: request.churchId as ChurchId,
      });
      return reply.status(204).send();
    });

    app.post(
      '/events/:eventId/slots/generate',
      {
        schema: {
          body: generateSlotsBodySchema,
          response: { 201: timeSlotListResponseSchema },
        },
      },
      async (request, reply) => {
        const { eventId } = request.params as { eventId: string };
        const body = request.body as {
          strategy:
            | {
                kind: 'equal-split';
                slotDurationMinutes: number;
              }
            | {
                kind: 'template-based';
                periods: Array<{
                  label: string;
                  startTime: string;
                  endTime: string;
                  requirements?: Array<{
                    roleId: string;
                    teamId?: string;
                    requiredCount: number;
                    notes?: string;
                  }>;
                }>;
              };
        };

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
          churchId: request.churchId as ChurchId,
          eventId: eventId as EventId,
          strategy,
        });
        return reply.status(201).send(timeSlotMapper.listToResponse(slots));
      },
    );

    app.put(
      '/events/:eventId/slots/:slotId/requirements',
      {
        schema: {
          body: slotRequirementBodySchema,
          response: { 200: slotRequirementResponseSchema },
        },
      },
      async (request, reply) => {
        const { slotId } = request.params as {
          eventId: string;
          slotId: string;
        };
        const body = request.body as {
          roleId: string;
          teamId?: string;
          requiredCount: number;
          notes?: string;
        };
        const req = await this.eventManager.upsertSlotRequirement({
          churchId: request.churchId as ChurchId,
          slotId: slotId as TimeSlotId,
          roleId: body.roleId as RoleId,
          teamId: body.teamId as TeamId | undefined,
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
          body: createAssignmentBodySchema,
          response: { 201: assignmentResponseSchema },
        },
      },
      async (request, reply) => {
        const body = request.body as {
          slotId: string;
          volunteerId: string;
          roleId: string;
          reason?: string;
        };
        const result = await this.assignmentManager.createAssignment({
          churchId: request.churchId as ChurchId,
          slotId:
            body.slotId as import('../../domain/entities/time-slot').TimeSlotId,
          volunteerId:
            body.volunteerId as import('../../domain/entities/volunteer').VolunteerId,
          roleId: body.roleId as RoleId,
          actorId: request.volunteerId as UserId,
          reason: body.reason,
        });
        return reply.status(201).send(assignmentMapper.toResponse(result));
      },
    );

    app.delete('/assignments/:assignmentId', {}, async (request, reply) => {
      const { assignmentId } = request.params as { assignmentId: string };
      await this.assignmentManager.deleteAssignment({
        assignmentId: assignmentId as AssignmentId,
        churchId: request.churchId as ChurchId,
      });
      return reply.status(204).send();
    });

    app.get(
      '/assignments/:assignmentId/audit',
      { schema: { response: { 200: auditListResponseSchema } } },
      async (request, reply) => {
        const { assignmentId } = request.params as { assignmentId: string };
        const items = await this.assignmentManager.listAuditLog({
          assignmentId: assignmentId as AssignmentId,
          churchId: request.churchId as ChurchId,
        });
        return reply.send(assignmentMapper.auditListToResponse(items));
      },
    );

    // Role template routes
    app.get(
      '/role-templates',
      { schema: { response: { 200: roleTemplateListResponseSchema } } },
      async (request, reply) => {
        const { ministryId } = request.query as { ministryId: string };
        const templates = await this.roleManager.listTemplates({
          churchId: request.churchId as ChurchId,
          ministryId: ministryId as MinistryId,
        });
        return reply.send(roleTemplateMapper.listToResponse(templates));
      },
    );

    app.put(
      '/role-templates/:templateId',
      {
        schema: {
          body: upsertRoleTemplateBodySchema,
          response: { 200: roleTemplateResponseSchema },
        },
      },
      async (request, reply) => {
        const { templateId } = request.params as { templateId: string };
        const body = request.body as {
          ministryId: string;
          name: string;
          items: Array<{ roleId: string; requiredCount: number }>;
        };
        const template = await this.roleManager.upsertTemplate({
          churchId: request.churchId as ChurchId,
          ministryId: body.ministryId as MinistryId,
          templateId: templateId as RoleTemplateId,
          name: body.name,
          items: body.items.map((i) => ({
            roleId: i.roleId as RoleId,
            requiredCount: i.requiredCount,
          })),
        });
        return reply.send(roleTemplateMapper.toResponse(template));
      },
    );

    app.delete('/role-templates/:templateId', {}, async (request, reply) => {
      const { templateId } = request.params as { templateId: string };
      await this.roleManager.deleteTemplate({
        templateId,
        churchId: request.churchId as ChurchId,
      });
      return reply.status(204).send();
    });
  }
}
