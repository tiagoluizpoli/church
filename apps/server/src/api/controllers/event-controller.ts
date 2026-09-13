import 'reflect-metadata';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import {
  ChurchId,
  EventId,
  MinistryId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IEventManager } from '../../domain/contracts/application/event-manager';
import type { EventStatus } from '../../domain/entities/event';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import { denyEventScope } from '../auth/deny-event-scope';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  eventListResponseSchema,
  eventMapper,
  listEventsQuerySchema,
  scheduleBuilderDataResponseSchema,
} from '../dtos/event.dto';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

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

interface DenyMissingVolunteerProfileInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

interface DenyMinistryScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  ministryId: string;
}

@injectable()
export class EventController implements FastifyController {
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
    // Most routes here are pure Church-authority operations that a
    // ChurchAdmin with no Volunteer profile must still be able to reach —
    // see createActiveChurchPreValidation's own doc comment. `requireVolunteer`
    // therefore stays off at the controller level; `/schedule-builder` below,
    // the only route here that reads `request.volunteerId`, checks for it
    // itself.
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({
        resolver: this.activeChurchResolver,
      }),
    );

    app.get(
      '/schedule-builder',
      {
        schema: {
          tags: ['events'],
          operationId: 'getScheduleBuilderData',
          summary: 'Get schedule builder data for an Event',
          description:
            'Get the TimeSlots, Shifts, and eligible Volunteers needed to build a schedule for an Event.',
          query: z.object({
            eventId: z.string(),
            ministryId: z.string().optional(),
          }),
          response: {
            200: scheduleBuilderDataResponseSchema,
            401: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const deniedProfile = await this.denyMissingVolunteerProfile({
          request,
          reply,
        });
        if (deniedProfile) return;

        const { eventId, ministryId } = request.query as ScheduleBuilderQuery;
        const data = await this.eventManager.getScheduleBuilderData({
          churchId: ChurchId.from(request.churchId),
          eventId: EventId.from(eventId),
          volunteerId: VolunteerId.from(request.volunteerId as string),
          ministryId: ministryId ? MinistryId.from(ministryId) : undefined,
        });
        return reply.send(eventMapper.scheduleBuilderToResponse(data));
      },
    );

    app.get(
      '/',
      {
        schema: {
          tags: ['events'],
          operationId: 'listEvents',
          summary: "List a Ministry's Events",
          description:
            'List Events for a Ministry, optionally filtered by status.',
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
          status: status as EventStatus | undefined,
        });
        return reply.send(eventMapper.listToResponse(events));
      },
    );

    app.post(
      '/:eventId/cancel',
      {
        schema: {
          tags: ['events'],
          operationId: 'cancelEvent',
          summary: 'Cancel an Event',
          description: 'Cancel an Event.',
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

        await this.eventManager.cancelEvent({
          eventId: EventId.from(eventId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(201).send({ cancelled: true });
      },
    );

    app.post(
      '/:eventId/reminders',
      {
        schema: {
          tags: ['events'],
          operationId: 'sendReminders',
          summary: 'Send Event reminders',
          description:
            'Send an availability reminder VolunteerNotification for an Event.',
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

        await this.eventManager.sendReminder({
          eventId: EventId.from(eventId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(201).send({ sent: true });
      },
    );
  }

  /**
   * `/schedule-builder` is the only route here that reads
   * `request.volunteerId` — everywhere else in this controller is a pure
   * Church-authority operation a Volunteer-less ChurchAdmin must still
   * reach, so the profile requirement is scoped to just this route instead
   * of the controller's shared preValidation hook.
   */
  private async denyMissingVolunteerProfile({
    request,
    reply,
  }: DenyMissingVolunteerProfileInput): Promise<boolean> {
    if (request.volunteerId) return false;

    reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Volunteer profile not found',
    });
    return true;
  }

  /**
   * Returns whether access was denied. `FastifyReply` is a thenable (it
   * resolves once the response is flushed) — `return reply.send(...)` from
   * an `async` method would have its own returned promise silently adopt
   * that reply's resolution instead of the reply object itself, so callers
   * must never `await` a reply and branch on the awaited value. Each guard
   * here sends the 403 as a side effect and returns a plain boolean.
   */
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
}
