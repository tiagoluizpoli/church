import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type { z } from 'zod';
import {
  ChurchId,
  EventId,
  RoleId,
  TeamId,
  TimeSlotId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IEventManager } from '../../domain/contracts/application/event-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import { denyEventScope } from '../auth/deny-event-scope';
import type { FastifyController } from '../contracts/fastify-controller';
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
import {
  dateFromInstantString,
  optionalDateFromInstantString,
} from '../utils/request-time';

interface EventRouteParams {
  eventId: string;
}

interface EventSlotRouteParams {
  eventId: string;
  slotId: string;
}

@injectable()
export class TimeSlotController implements FastifyController {
  readonly prefix = '/events';

  constructor(
    @inject('IEventManager')
    private readonly eventManager: IEventManager,
    @inject('IActiveChurchResolver')
    private readonly activeChurchResolver: IActiveChurchResolver,
    @inject('AuthorityGuard')
    private readonly authorityGuard: AuthorityGuard,
  ) {}

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({
        resolver: this.activeChurchResolver,
      }),
    );

    app.post(
      '/:eventId/slots',
      {
        schema: {
          tags: ['time-slots'],
          operationId: 'createSlot',
          summary: 'Create a TimeSlot on an Event',
          description: 'Create a TimeSlot within an Event.',
          body: createSlotBodySchema,
          response: { 201: timeSlotResponseSchema },
        },
      },
      async (request, reply) => {
        const { eventId } = request.params as EventRouteParams;
        const denied = await denyEventScope({
          request,
          reply,
          eventId,
          authorityGuard: this.authorityGuard,
        });
        if (denied) return;

        const body = request.body as z.infer<typeof createSlotBodySchema>;
        const slot = await this.eventManager.createSlot({
          churchId: ChurchId.from(request.churchId),
          eventId: EventId.from(eventId),
          startTime: dateFromInstantString({ value: body.startTime }),
          endTime: dateFromInstantString({ value: body.endTime }),
          label: body.label,
        });
        return reply.status(201).send(timeSlotMapper.toResponse(slot));
      },
    );

    app.patch(
      '/:eventId/slots/:slotId',
      {
        schema: {
          tags: ['time-slots'],
          operationId: 'updateSlot',
          summary: 'Update a TimeSlot',
          description: "Update a TimeSlot's bounds or label.",
          body: updateSlotBodySchema,
          response: { 200: timeSlotResponseSchema },
        },
      },
      async (request, reply) => {
        const { eventId, slotId } = request.params as EventSlotRouteParams;
        const denied = await denyEventScope({
          request,
          reply,
          eventId,
          authorityGuard: this.authorityGuard,
        });
        if (denied) return;

        const body = request.body as z.infer<typeof updateSlotBodySchema>;
        const slot = await this.eventManager.updateSlot({
          churchId: ChurchId.from(request.churchId),
          slotId: TimeSlotId.from(slotId),
          startTime: optionalDateFromInstantString({ value: body.startTime }),
          endTime: optionalDateFromInstantString({ value: body.endTime }),
          label: body.label,
        });
        return reply.send(timeSlotMapper.toResponse(slot));
      },
    );

    app.delete(
      '/:eventId/slots/:slotId',
      {
        schema: {
          tags: ['time-slots'],
          operationId: 'deleteSlot',
          summary: 'Delete a TimeSlot',
          description: 'Delete a TimeSlot from an Event.',
        },
      },
      async (request, reply) => {
        const { eventId, slotId } = request.params as EventSlotRouteParams;
        const denied = await denyEventScope({
          request,
          reply,
          eventId,
          authorityGuard: this.authorityGuard,
        });
        if (denied) return;

        await this.eventManager.deleteSlot({
          slotId: TimeSlotId.from(slotId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(204).send();
      },
    );

    app.post(
      '/:eventId/slots/generate',
      {
        schema: {
          tags: ['time-slots'],
          operationId: 'generateSlots',
          summary: 'Generate TimeSlots for an Event',
          description:
            'Generate TimeSlots for an Event, either as an equal split or from a set of manually labelled TimeSlots with their own requirements.',
          body: generateSlotsBodySchema,
          response: { 201: timeSlotListResponseSchema },
        },
      },
      async (request, reply) => {
        const { eventId } = request.params as EventRouteParams;
        const denied = await denyEventScope({
          request,
          reply,
          eventId,
          authorityGuard: this.authorityGuard,
        });
        if (denied) return;

        const body = request.body as z.infer<typeof generateSlotsBodySchema>;

        const strategy =
          body.strategy.kind === 'equal-split'
            ? body.strategy
            : {
                kind: 'template-based' as const,
                periods: body.strategy.periods.map((p) => ({
                  label: p.label,
                  startTime: dateFromInstantString({ value: p.startTime }),
                  endTime: dateFromInstantString({ value: p.endTime }),
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
      '/:eventId/slots/:slotId/requirements',
      {
        schema: {
          tags: ['time-slots'],
          operationId: 'upsertSlotRequirement',
          summary: 'Set a TimeSlot staffing requirement',
          description:
            'Set the staffing headcount for a Role (and optional Team) within a TimeSlot.',
          body: slotRequirementBodySchema,
          response: { 200: slotRequirementResponseSchema },
        },
      },
      async (request, reply) => {
        const { eventId, slotId } = request.params as EventSlotRouteParams;
        const denied = await denyEventScope({
          request,
          reply,
          eventId,
          authorityGuard: this.authorityGuard,
        });
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
  }
}
