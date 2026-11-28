import { NotFoundError } from '@church/core';
import { z } from 'zod';
import { EventId, MinistryId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IEventManager } from '../../domain/contracts/application/event-manager';
import type { EventStatus } from '../../domain/entities/event';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import {
  denyMinistryFunction,
  denyMinistryManagement,
} from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  eventListResponseSchema,
  eventMapper,
  listEventsQuerySchema,
  scheduleBuilderDataResponseSchema,
} from '../dtos/event.dto';
import { idSchema } from '../dtos/id.dto';
import { refuse } from '../utils/refuse';
import type { EventControllerDependencies } from './event-controller.types';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export class EventController implements FastifyController {
  readonly prefix = '/events';

  private readonly eventManager: IEventManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;

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
          querystring: z.object({
            eventId: idSchema,
            ministryId: idSchema.optional(),
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
        const { authorityGuard } = this;
        if (await denyMinistryFunction({ authorityGuard, request, reply })) {
          return;
        }

        const { eventId, ministryId } = request.query;
        try {
          const data = await this.eventManager.getScheduleBuilderData({
            churchId: request.churchId,
            eventId: EventId.from(eventId),
            userId: request.userId,
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
          querystring: listEventsQuerySchema,
          response: {
            200: eventListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ministryId, status } = request.query;
        const denied = await denyMinistryManagement({
          authorityGuard: this.authorityGuard,
          request,
          reply,
          ministryId: MinistryId.from(ministryId),
        });
        if (denied) return;

        const events = await this.eventManager.listEvents({
          churchId: request.churchId,
          ministryId: MinistryId.from(ministryId),
          status: status as EventStatus | undefined,
        });
        return reply.send(eventMapper.listToResponse(events));
      },
    );
  }
}
