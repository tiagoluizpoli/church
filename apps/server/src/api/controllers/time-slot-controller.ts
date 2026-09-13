import 'reflect-metadata';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { inject, injectable } from 'tsyringe';
import type { z } from 'zod';
import {
  ChurchId,
  EventId,
  RoleId,
  TeamId,
  TimeSlotId,
  UserId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IEventManager } from '../../domain/contracts/application/event-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
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

interface EventRouteParams {
  eventId: string;
}

interface EventSlotRouteParams {
  eventId: string;
  slotId: string;
}

interface DenyEventScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  eventId: string;
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
      '/:eventId/slots/:slotId',
      {
        schema: {
          tags: ['time-slots'],
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
      '/:eventId/slots/:slotId',
      { schema: { tags: ['time-slots'], operationId: 'deleteSlot' } },
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
      '/:eventId/slots/generate',
      {
        schema: {
          tags: ['time-slots'],
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
      '/:eventId/slots/:slotId/requirements',
      {
        schema: {
          tags: ['time-slots'],
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
  }

  /**
   * Returns whether access was denied. `FastifyReply` is a thenable (it
   * resolves once the response is flushed) — `return reply.send(...)` from
   * an `async` method would have its own returned promise silently adopt
   * that reply's resolution instead of the reply object itself, so callers
   * must never `await` a reply and branch on the awaited value. Each guard
   * here sends the 403 as a side effect and returns a plain boolean.
   */
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
}
