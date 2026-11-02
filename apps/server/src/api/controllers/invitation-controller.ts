import { z } from 'zod';
import { ChurchId, MinistryId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IInvitationListManager } from '../../domain/contracts/application/invitation-list-manager';
import type { InvitationListScope } from '../../domain/entities/invitation-list-item';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  invitationListMapper,
  invitationListQuerystringSchema,
  invitationListResponseSchema,
} from '../dtos/invitation-list.dto';
import { refuse } from '../utils/refuse';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

interface InvitationControllerDependencies {
  invitationListManager: IInvitationListManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
  /** Most invitations one page may ask for (validated central config). */
  maxPageSize: number;
}

/** The Invitations management page: the Active Church's offers within the caller's authority. */
export class InvitationController implements FastifyController {
  readonly prefix = '/invitations';

  private readonly invitationListManager: IInvitationListManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;
  private readonly maxPageSize: number;

  constructor({
    invitationListManager,
    activeChurchResolver,
    authorityGuard,
    maxPageSize,
  }: InvitationControllerDependencies) {
    this.invitationListManager = invitationListManager;
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
    this.maxPageSize = maxPageSize;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({ resolver: this.activeChurchResolver }),
    );

    app.get(
      '/',
      {
        schema: {
          tags: ['invitations'],
          operationId: 'listInvitations',
          summary: 'List invitations',
          description:
            "List the Active Church's offers, newest created first. Pending (the default) includes expired offers badged; Expired is pending past its expiry; Accepted, Declined and Revoked are history with the closure facts that were recorded. Status, Ministry, invited-as and email filters combine before pagination. A ChurchAdmin sees every Ministry offer and admin Church grant; a Ministry leader sees only Ministry offers in the Ministries they lead.",
          querystring: invitationListQuerystringSchema.extend({
            limit: z.coerce
              .number()
              .int()
              .min(1)
              .max(this.maxPageSize)
              .optional(),
          }),
          response: {
            200: invitationListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const churchId = ChurchId.from(request.churchId);
        const { isChurchAdmin, ledMinistries } =
          await this.authorityGuard.resolveCallerCapabilities({
            churchId,
            userId: UserId.from(request.userId),
          });
        if (!isChurchAdmin && ledMinistries.length === 0) {
          return refuse({ reply, request, code: 'FORBIDDEN' });
        }
        // A person who is both gets admin behavior.
        const scope: InvitationListScope = isChurchAdmin
          ? { kind: 'church' }
          : {
              kind: 'ministries',
              ministryIds: ledMinistries.map((m) =>
                MinistryId.from(m.ministryId),
              ),
            };
        const { cursor, limit, ...filters } = request.query as z.infer<
          typeof invitationListQuerystringSchema
        >;
        const page = await this.invitationListManager.list({
          churchId,
          scope,
          filters,
          cursor,
          limit,
        });
        return reply.send(invitationListMapper.toResponse(page));
      },
    );
  }
}
