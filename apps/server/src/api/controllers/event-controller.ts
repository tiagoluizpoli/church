import { NotFoundError } from '@church/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ChurchId,
  EventId,
  MinistryId,
  UserId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IEventManager } from '../../domain/contracts/application/event-manager';
import type { EventStatus } from '../../domain/entities/event';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  eventListResponseSchema,
  eventMapper,
  listEventsQuerySchema,
  scheduleBuilderDataResponseSchema,
} from '../dtos/event.dto';
import { refuse } from '../utils/refuse';

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

interface DenySchedulingFunctionInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

interface DenyMinistryObjectInput {
  request: FastifyRequest;
  reply: FastifyReply;
  ministryId: string;
}

interface EventControllerDependencies {
  eventManager: IEventManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
}

export class EventController implements FastifyController {
  readonly prefix = '/events';

  private readonly eventManager: IEventManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;

  constructor({
    eventManager,
    activeChurchResolver,
    authorityGuard,
  }: EventControllerDependencies) {
    this.eventManager = eventManager;
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
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

    app.get(
      '/schedule-builder',
      {
        schema: {
          tags: ['events'],
          operationId: 'getScheduleBuilderData',
          summary: 'Get schedule builder data for an Event',
          description:
            'Get the EventTimeBlocks, Shifts, and eligible Volunteers needed to build a schedule for an Event.',
          query: z.object({
            eventId: z.string(),
            ministryId: z.string().optional(),
          }),
          response: {
            200: scheduleBuilderDataResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const deniedFunction = await this.denyMissingSchedulingFunction({
          request,
          reply,
        });
        if (deniedFunction) return;

        const { eventId, ministryId } = request.query as ScheduleBuilderQuery;
        try {
          const data = await this.eventManager.getScheduleBuilderData({
            churchId: ChurchId.from(request.churchId),
            eventId: EventId.from(eventId),
            userId: UserId.from(request.userId),
            ministryId: ministryId ? MinistryId.from(ministryId) : undefined,
          });
          return reply.send(eventMapper.scheduleBuilderToResponse(data));
        } catch (error) {
          if (error instanceof NotFoundError) {
            return refuse({ reply, request, code: 'NOT_FOUND' });
          }
          throw error;
        }
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
          response: {
            200: eventListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ministryId, status } = request.query as ListEventsQuery;
        const deniedFunction = await this.denyMissingSchedulingFunction({
          request,
          reply,
        });
        if (deniedFunction) return;

        const deniedObject = await this.denyInaccessibleMinistry({
          request,
          reply,
          ministryId,
        });
        if (deniedObject) return;

        const events = await this.eventManager.listEvents({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          status: status as EventStatus | undefined,
        });
        return reply.send(eventMapper.listToResponse(events));
      },
    );
  }

  /**
   * Returns whether access was denied. `FastifyReply` is a thenable (it
   * resolves once the response is flushed) — `return reply.send(...)` from
   * an `async` method would have its own returned promise silently adopt
   * that reply's resolution instead of the reply object itself, so callers
   * must never `await` a reply and branch on the awaited value. Each guard
   * here sends the refusal as a side effect and returns a plain boolean.
   */
  private async denyMissingSchedulingFunction({
    request,
    reply,
  }: DenySchedulingFunctionInput): Promise<boolean> {
    const decision = await this.authorityGuard.decideManageAnyMinistry({
      churchId: ChurchId.from(request.churchId),
      userId: UserId.from(request.userId),
    });
    if (decision.allowed) return false;

    refuse({ reply, request, code: 'FORBIDDEN' });
    return true;
  }

  private async denyInaccessibleMinistry({
    request,
    reply,
    ministryId,
  }: DenyMinistryObjectInput): Promise<boolean> {
    const decision = await this.authorityGuard.decideManageMinistry({
      churchId: ChurchId.from(request.churchId),
      ministryId: MinistryId.from(ministryId),
      userId: UserId.from(request.userId),
    });
    if (decision.allowed) return false;

    refuse({ reply, request, code: 'NOT_FOUND' });
    return true;
  }
}
