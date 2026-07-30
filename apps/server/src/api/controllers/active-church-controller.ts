import 'reflect-metadata';
import { auth } from '@church/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { ChurchId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IActiveChurchSelectionManager } from '../../domain/contracts/application/active-church-selection-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { resolveActiveChurchAndPersist } from '../auth/resolve-active-church-and-persist';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  activeChurchMapper,
  activeChurchStatusResponseSchema,
  churchSelectionListResponseSchema,
  selectActiveChurchBodySchema,
} from '../dtos/active-church.dto';
import { headersFromRequest } from '../utils/headers';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

interface AuthenticatedSession {
  userId: string;
  activeOrganizationId: string | null;
}

/**
 * Every route here needs a session but none may assume an Active Church
 * exists yet, so this replaces the three verbatim `getSession` + 401 blocks
 * that would otherwise open each handler.
 */
async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthenticatedSession | null> {
  const session = await auth.api
    .getSession({ headers: headersFromRequest(request) })
    .catch(() => null);
  if (!session?.user) {
    await reply
      .status(401)
      .send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    return null;
  }
  return {
    userId: session.user.id,
    activeOrganizationId: session.session.activeOrganizationId ?? null,
  };
}

/**
 * Entry-gate status and the compare-access selector (spec.md §1.5). Deliberately
 * outside `createActiveChurchPreValidation`'s hook: every route here must work
 * *before* an Active Church exists — `selection_required` is this controller's
 * normal, 200-status result, never a denial.
 */
@injectable()
export class ActiveChurchController implements FastifyController {
  readonly prefix = '/active-church';

  constructor(
    @inject('IActiveChurchResolver')
    private readonly activeChurchResolver: IActiveChurchResolver,
    @inject('IActiveChurchSelectionManager')
    private readonly selectionManager: IActiveChurchSelectionManager,
  ) {}

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
          response: {
            200: activeChurchStatusResponseSchema,
            401: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const session = await requireSession(request, reply);
        if (!session) return;

        const resolution = await resolveActiveChurchAndPersist({
          resolver: this.activeChurchResolver,
          request,
          userId: UserId.from(session.userId),
          activeOrganizationId: session.activeOrganizationId
            ? ChurchId.from(session.activeOrganizationId)
            : null,
        });
        return reply.send(activeChurchMapper.toStatusResponse(resolution));
      },
    );

    app.get(
      '/options',
      {
        schema: {
          tags: ['active-church'],
          operationId: 'listActiveChurchOptions',
          response: {
            200: churchSelectionListResponseSchema,
            401: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const session = await requireSession(request, reply);
        if (!session) return;

        const options = await this.selectionManager.listSelectableChurches({
          userId: UserId.from(session.userId),
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
          body: selectActiveChurchBodySchema,
          response: {
            200: activeChurchStatusResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const session = await requireSession(request, reply);
        if (!session) return;

        const body = request.body as z.infer<
          typeof selectActiveChurchBodySchema
        >;
        const resolution = await this.selectionManager.selectActiveChurch({
          userId: UserId.from(session.userId),
          churchId: ChurchId.from(body.churchId),
        });

        if (resolution.status !== 'resolved') {
          return reply.status(403).send({
            error: 'FORBIDDEN',
            message: 'Not a member of that Church',
          });
        }

        await auth.api
          .setActiveOrganization({
            headers: headersFromRequest(request),
            body: { organizationId: resolution.churchId },
          })
          .catch((error) => {
            request.log.warn(
              { err: error },
              'Failed to persist the selected active organization onto the session',
            );
          });

        return reply.send(activeChurchMapper.toStatusResponse(resolution));
      },
    );
  }
}
