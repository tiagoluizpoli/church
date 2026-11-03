import { z } from 'zod';
import { ChurchId, MinistryId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IInvitationListManager } from '../../domain/contracts/application/invitation-list-manager';
import type { IMinistryInvitationManager } from '../../domain/contracts/application/ministry-invitation-manager';
import type { InvitationListScope } from '../../domain/entities/invitation-list-item';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  adminInvitationMapper,
  adminInvitationResponseSchema,
  mintAdminInvitationBodySchema,
  mintAdminInvitationConflictSchema,
} from '../dtos/admin-invitation.dto';
import {
  churchInvitationResendMapper,
  churchInvitationResendResponseSchema,
} from '../dtos/church-invitation-resend.dto';
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

interface ChurchInvitationParams {
  invitationId: string;
}

/** The page size the route's own schema bounds by the configured maximum. */
interface ListLimitQuery {
  limit?: number;
}

interface InvitationControllerDependencies {
  invitationListManager: IInvitationListManager;
  ministryInvitationManager: IMinistryInvitationManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
  /** Most invitations one page may ask for (validated central config). */
  maxPageSize: number;
}

/** The Invitations management page: the Active Church's offers within the caller's authority. */
export class InvitationController implements FastifyController {
  readonly prefix = '/invitations';

  private readonly invitationListManager: IInvitationListManager;
  private readonly ministryInvitationManager: IMinistryInvitationManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;
  private readonly maxPageSize: number;

  constructor({
    invitationListManager,
    ministryInvitationManager,
    activeChurchResolver,
    authorityGuard,
    maxPageSize,
  }: InvitationControllerDependencies) {
    this.invitationListManager = invitationListManager;
    this.ministryInvitationManager = ministryInvitationManager;
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
        > &
          ListLimitQuery;
        const page = await this.invitationListManager.list({
          churchId,
          userId: UserId.from(request.userId),
          scope,
          filters,
          cursor,
          limit,
        });
        return reply.send(invitationListMapper.toResponse(page));
      },
    );

    app.post(
      '/admin',
      {
        schema: {
          tags: ['invitations'],
          operationId: 'mintAdminInvitation',
          summary: 'Invite a ChurchAdmin',
          description:
            'Invite an address to the Active Church as an Admin. With no pending Church Invitation for the address, creates one (201). A pending member-level Church Invitation is raised to Admin in place, keeping its Ministry Invitations and restarting its validity (200). Either way one invitation email is queued. ChurchAdmins only.',
          body: mintAdminInvitationBodySchema,
          response: {
            200: adminInvitationResponseSchema,
            201: adminInvitationResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: mintAdminInvitationConflictSchema,
          },
        },
      },
      async (request, reply) => {
        const churchId = ChurchId.from(request.churchId);
        const inviterId = UserId.from(request.userId);
        const canManageChurch = await this.authorityGuard.canManageChurch({
          churchId,
          userId: inviterId,
        });
        if (!canManageChurch) {
          return refuse({ reply, request, code: 'FORBIDDEN' });
        }
        const { email } = request.body as z.infer<
          typeof mintAdminInvitationBodySchema
        >;
        const invitation = await this.ministryInvitationManager.mintAdmin({
          churchId,
          inviterId,
          email,
        });
        return reply
          .status(invitation.outcome === 'created' ? 201 : 200)
          .send(adminInvitationMapper.toResponse(invitation));
      },
    );

    app.post(
      '/church/:invitationId/resend',
      {
        schema: {
          tags: ['invitations'],
          operationId: 'resendChurchInvitation',
          summary: 'Resend a Church Invitation',
          description:
            'Queue one fresh invitation email for a pending or expired admin Church offer and restart its validity on the Church lifetime, aligning every still-pending Ministry Invitation sharing it. Recipient, inviter, IDs, grants and Roles are kept. The throttle counters belong to the Church Invitation only. ChurchAdmins only; a missing or other-Church target is 404; 409 INVITATION_NOT_PENDING when already accepted, declined or revoked; 429 when the cooldown or daily cap applies.',
          params: z.object({ invitationId: z.string().min(1) }),
          response: {
            200: churchInvitationResendResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            429: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const churchId = ChurchId.from(request.churchId);
        const canManageChurch = await this.authorityGuard.canManageChurch({
          churchId,
          userId: UserId.from(request.userId),
        });
        if (!canManageChurch) {
          return refuse({ reply, request, code: 'FORBIDDEN' });
        }
        const { invitationId } = request.params as ChurchInvitationParams;
        const resent = await this.ministryInvitationManager.resendChurch({
          churchId,
          churchInvitationId: invitationId,
        });
        if (!resent) return refuse({ reply, request, code: 'NOT_FOUND' });
        return reply.send(churchInvitationResendMapper.toResponse(resent));
      },
    );

    app.post(
      '/church/:invitationId/revoke',
      {
        schema: {
          tags: ['invitations'],
          operationId: 'revokeChurchInvitation',
          summary: 'Revoke a Church Invitation',
          description:
            'Revoke a pending or expired Church offer together with every still-pending Ministry Invitation sharing it (expired included), recording the caller, one time and the reason `manual` on each; the body takes no actor or reason. Accepted, declined and revoked Ministry Invitations, Roles and Memberships are untouched and no notice is sent. ChurchAdmins only; a missing or other-Church target is 404; 409 INVITATION_NOT_PENDING when already accepted, declined or revoked.',
          params: z.object({ invitationId: z.string().min(1) }),
          response: {
            204: z.null(),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const churchId = ChurchId.from(request.churchId);
        const callerId = UserId.from(request.userId);
        const canManageChurch = await this.authorityGuard.canManageChurch({
          churchId,
          userId: callerId,
        });
        if (!canManageChurch) {
          return refuse({ reply, request, code: 'FORBIDDEN' });
        }
        const { invitationId } = request.params as ChurchInvitationParams;
        const revoked = await this.ministryInvitationManager.revokeChurch({
          churchId,
          churchInvitationId: invitationId,
          callerId,
        });
        if (!revoked) return refuse({ reply, request, code: 'NOT_FOUND' });
        return reply.status(204).send(null);
      },
    );
  }
}
