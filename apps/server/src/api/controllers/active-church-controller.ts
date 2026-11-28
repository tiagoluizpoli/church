import { z } from 'zod';
import { ChurchId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IActiveChurchSelectionManager } from '../../domain/contracts/application/active-church-selection-manager';
import type { CallerSession } from '../../domain/contracts/infrastructure';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { resolveActiveChurchAndPersist } from '../auth/resolve-active-church-and-persist';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  type ActiveChurchStatusResponse,
  activeChurchMapper,
  activeChurchStatusResponseSchema,
  churchSelectionListResponseSchema,
  selectActiveChurchBodySchema,
} from '../dtos/active-church.dto';
import { errorResponseSchema } from '../dtos/error-response.dto';
import { serviceUnavailableResponseSchema } from '../dtos/service-unavailable.dto';
import { headersFromRequest } from '../utils/headers';
import { refuse } from '../utils/refuse';
import type {
  ActiveChurchControllerDependencies,
  BuildStatusResponseInput,
  RequireSessionInput,
} from './active-church-controller.types';

// The request id doubles as the reference code a Person reads out to support.
const internalErrorResponseSchema = errorResponseSchema.extend({
  requestId: z.string(),
});

/**
 * Every route here needs a session but none may assume an Active Church
 * exists yet, so this replaces the three verbatim `getSession` + 401 blocks
 * that would otherwise open each handler.
 */
async function requireSession({
  request,
  reply,
}: RequireSessionInput): Promise<CallerSession | null> {
  const session = await request.server.sessionGateway.lookup({
    headers: headersFromRequest(request),
  });
  if (!session) {
    // FastifyReply is thenable: send without awaiting, return a plain value.
    refuse({ reply, request, code: 'UNAUTHORIZED' });
    return null;
  }
  return session;
}

export class ActiveChurchController implements FastifyController {
  readonly prefix = '/active-church';

  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly selectionManager: IActiveChurchSelectionManager;

  constructor({
    activeChurchResolver,
    selectionManager,
  }: ActiveChurchControllerDependencies) {
    this.activeChurchResolver = activeChurchResolver;
    this.selectionManager = selectionManager;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.get(
      '/status',
      {
        schema: {
          tags: ['active-church'],
          operationId: 'getActiveChurchStatus',
          summary: 'Get the Active Church status',
          description:
            'Resolve the session Active Church, returning its status or a selection_required result when none is set yet.',
          response: {
            200: activeChurchStatusResponseSchema,
            401: errorResponseSchema,
            503: serviceUnavailableResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const session = await requireSession({ request, reply });
        if (!session) return;

        const resolution = await resolveActiveChurchAndPersist({
          resolver: this.activeChurchResolver,
          request,
          userId: session.userId,
          activeOrganizationId: session.activeOrganizationId,
        });
        return reply.send(await this.buildStatusResponse({ resolution }));
      },
    );

    app.get(
      '/options',
      {
        schema: {
          tags: ['active-church'],
          operationId: 'listActiveChurchOptions',
          summary: 'List selectable Churches',
          description:
            'List the Churches the current User holds Church Membership in and may select as their Active Church.',
          response: {
            200: churchSelectionListResponseSchema,
            401: errorResponseSchema,
            503: serviceUnavailableResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const session = await requireSession({ request, reply });
        if (!session) return;

        const options = await this.selectionManager.listSelectableChurches({
          userId: session.userId,
        });
        return reply.send(activeChurchMapper.toSelectionListResponse(options));
      },
    );

    app.post(
      '/select',
      {
        schema: {
          tags: ['active-church'],
          operationId: 'selectActiveChurch',
          summary: 'Select the Active Church',
          description:
            "Set the session's Active Church to a Church the current User holds Church Membership in.",
          body: selectActiveChurchBodySchema,
          response: {
            200: activeChurchStatusResponseSchema,
            401: errorResponseSchema,
            503: serviceUnavailableResponseSchema,
            403: errorResponseSchema,
            500: internalErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const session = await requireSession({ request, reply });
        if (!session) return;

        const body = request.body;
        const resolution = await this.selectionManager.selectActiveChurch({
          userId: session.userId,
          churchId: ChurchId.from(body.churchId),
        });

        if (resolution.status !== 'resolved') {
          return refuse({ reply, request, code: 'FORBIDDEN' });
        }

        // A failed save must reach the standard 500: answering "resolved" would show a Church the session does not scope.
        await request.server.sessionGateway.setActiveChurch({
          headers: headersFromRequest(request),
          churchId: resolution.churchId,
        });

        return reply.send(await this.buildStatusResponse({ resolution }));
      },
    );
  }

  /**
   * The one status shape both entry-gate routes return. Only a resolved
   * Church has a Church Timezone to look up, so the lookup lives on that
   * branch alone.
   */
  private async buildStatusResponse({
    resolution,
  }: BuildStatusResponseInput): Promise<ActiveChurchStatusResponse> {
    if (resolution.status !== 'resolved') {
      return activeChurchMapper.toUnresolvedStatusResponse({ resolution });
    }
    const timezone = await this.selectionManager.getChurchTimezone({
      churchId: resolution.churchId,
    });
    return activeChurchMapper.toResolvedStatusResponse({
      resolution,
      timezone,
    });
  }
}
