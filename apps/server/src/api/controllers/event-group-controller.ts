import { z } from 'zod';
import { ChurchId, MinistryId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IEventGroupManager } from '../../domain/contracts/application/event-group-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import { denyMinistryManagement } from '../auth/ministry-management-access';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  type EventGroupsBody,
  eventGroupsBodySchema,
  eventGroupsResponseSchema,
} from '../dtos/event-group.dto';
import type {
  EventGroupControllerDependencies,
  EventGroupRouteParams,
} from './event-group-controller.types';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

/**
 * A Ministry's Event groups for its export (#1247), read and saved whole, for
 * the Ministry's leaders and ChurchAdmins.
 */
export class EventGroupController implements FastifyController {
  readonly prefix = '/ministries/:ministryId/event-groups';

  private readonly eventGroupManager: IEventGroupManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;

  constructor({
    eventGroupManager,
    activeChurchResolver,
    authorityGuard,
  }: EventGroupControllerDependencies) {
    this.eventGroupManager = eventGroupManager;
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
    const errors = {
      401: errorResponseSchema,
      403: errorResponseSchema,
      404: errorResponseSchema,
    };

    app.get(
      '/',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'getEventGroups',
          summary: "Read a Ministry's Event groups",
          description:
            "The Ministry's Event groups in order with their EventTemplates, the catch-all's custom name, and every EventTemplate of the Church. No groups means the export is one plain list.",
          response: { 200: eventGroupsResponseSchema, ...errors },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params as EventGroupRouteParams;
        const scope = {
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
        };
        if (
          await denyMinistryManagement({
            authorityGuard: this.authorityGuard,
            request,
            reply,
            ministryId: scope.ministryId,
          })
        ) {
          return;
        }
        return reply.send(await this.eventGroupManager.read(scope));
      },
    );

    app.put(
      '/',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'saveEventGroups',
          summary: "Save a Ministry's Event groups",
          description:
            'Replace the whole ordered list; an empty list returns to one plain list and the last save wins. Each EventTemplate sits in at most one group (422 otherwise); a template outside the Church is 404.',
          body: eventGroupsBodySchema,
          response: { 200: eventGroupsResponseSchema, ...errors },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params as EventGroupRouteParams;
        const scope = {
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
        };
        if (
          await denyMinistryManagement({
            authorityGuard: this.authorityGuard,
            request,
            reply,
            ministryId: scope.ministryId,
          })
        ) {
          return;
        }
        const { groups, catchAllName } = request.body as EventGroupsBody;
        return reply.send(
          await this.eventGroupManager.save({
            ...scope,
            groups,
            catchAllName,
          }),
        );
      },
    );
  }
}
