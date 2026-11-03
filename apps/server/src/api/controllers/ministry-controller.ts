import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  RoleId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IMinistryInvitationManager } from '../../domain/contracts/application/ministry-invitation-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import { archiveBlockedResponseSchema } from '../dtos/archive-blocker.dto';
import {
  type MinistryNameBody,
  ministryListResponseSchema,
  ministryMapper,
  ministryNameBodySchema,
  ministryResponseSchema,
} from '../dtos/ministry.dto';
import {
  ministryInvitationMapper,
  ministryInvitationResponseSchema,
  mintMinistryInvitationBodySchema,
  mintMinistryInvitationConflictSchema,
  mintMinistryInvitationUnprocessableSchema,
} from '../dtos/ministry-invitation.dto';
import { refuse } from '../utils/refuse';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

interface MinistryRouteParams {
  ministryId: string;
}

type MinistryInvitationRouteParams = MinistryRouteParams;

interface MinistryInvitationActionRouteParams {
  ministryId: string;
  invitationId: string;
}

interface DenyMissingMinistryFunctionInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

type DenyNonAdminInput = DenyMissingMinistryFunctionInput;

interface DenyUnmanagedMinistryInput extends DenyMissingMinistryFunctionInput {
  ministryId: MinistryId;
}

interface MinistryControllerDependencies {
  ministryManager: IMinistryManager;
  ministryInvitationManager: IMinistryInvitationManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
}

export class MinistryController implements FastifyController {
  readonly prefix = '/ministries';

  private readonly ministryManager: IMinistryManager;
  private readonly ministryInvitationManager: IMinistryInvitationManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;

  constructor({
    ministryManager,
    ministryInvitationManager,
    activeChurchResolver,
    authorityGuard,
  }: MinistryControllerDependencies) {
    this.ministryManager = ministryManager;
    this.ministryInvitationManager = ministryInvitationManager;
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
      '/',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'listMinistries',
          summary: "List the caller's accessible Ministries",
          description:
            'List every Ministry for a ChurchAdmin, or the Ministries the caller actively leads.',
          response: {
            200: ministryListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const churchId = ChurchId.from(request.churchId);
        const capabilities =
          await this.authorityGuard.resolveCallerCapabilities({
            churchId,
            userId: UserId.from(request.userId),
          });
        if (
          !capabilities.isChurchAdmin &&
          capabilities.ledMinistries.length === 0
        ) {
          refuse({ reply, request, code: 'FORBIDDEN' });
          return;
        }
        const ministries = capabilities.isChurchAdmin
          ? await this.ministryManager.listByChurch(churchId)
          : await this.ministryManager.listByLeader({
              churchId,
              leaderId: VolunteerId.from(request.volunteerId as string),
            });
        return reply.send(ministryMapper.toResponseList(ministries));
      },
    );

    app.post(
      '/',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'createMinistry',
          summary: 'Create a Ministry',
          description:
            'Create an active Ministry in the Active Church. ChurchAdmin only; active names are unique ignoring case.',
          body: ministryNameBodySchema,
          response: {
            201: ministryResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (await this.denyNonAdmin({ request, reply })) return;
        const { name } = request.body as MinistryNameBody;
        const ministry = await this.ministryManager.create({
          churchId: ChurchId.from(request.churchId),
          name,
        });
        return reply.status(201).send(ministryMapper.toResponse(ministry));
      },
    );

    app.get(
      '/:ministryId',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'getMinistry',
          summary: 'Get a managed Ministry',
          description:
            'Get an active Ministry the caller manages: any for a ChurchAdmin, a led one for a Ministry leader.',
          response: {
            200: ministryResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (await this.denyMissingMinistryFunction({ request, reply })) return;
        const ministryId = MinistryId.from(
          (request.params as MinistryRouteParams).ministryId,
        );
        if (await this.denyUnmanagedMinistry({ request, reply, ministryId })) {
          return;
        }
        const ministry = await this.ministryManager.getActive({
          churchId: ChurchId.from(request.churchId),
          ministryId,
        });
        return reply.send(ministryMapper.toResponse(ministry));
      },
    );

    app.patch(
      '/:ministryId',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'renameMinistry',
          summary: 'Rename a Ministry',
          description:
            'Rename an active Ministry, keeping its identity. ChurchAdmin only; active names are unique ignoring case.',
          body: ministryNameBodySchema,
          response: {
            200: ministryResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (await this.denyNonAdmin({ request, reply })) return;
        const { ministryId } = request.params as MinistryRouteParams;
        const { name } = request.body as MinistryNameBody;
        const ministry = await this.ministryManager.rename({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          name,
        });
        return reply.send(ministryMapper.toResponse(ministry));
      },
    );

    app.post(
      '/:ministryId/archive',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'archiveMinistry',
          summary: 'Archive a Ministry',
          description:
            'Archive an active Ministry, keeping its history and freeing its name. ChurchAdmin only; refused with the blocking Cycles while it participates in an Event that has not ended.',
          response: {
            204: z.null(),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: archiveBlockedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (await this.denyNonAdmin({ request, reply })) return;
        const { ministryId } = request.params as MinistryRouteParams;
        await this.ministryManager.archive({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
        });
        return reply.status(204).send();
      },
    );

    // Ministry Invitation routes — reachable by ChurchAdmin or Ministry
    // leader alike, so they live here rather than under a role-specific
    // controller. A caller who manages no Ministry is refused 403 here;
    // `DbMinistryInvitationManager` enforces the per-Ministry authority
    // itself (indistinguishable 404 on any unauthorized/nonexistent/
    // cross-Church Ministry).
    app.post(
      '/:ministryId/invitations',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'mintMinistryInvitation',
          summary: 'Mint a Ministry Invitation',
          description:
            'Create a Ministry Invitation granting a Ministry Access Level and Roles to an emailed recipient.',
          body: mintMinistryInvitationBodySchema,
          response: {
            201: ministryInvitationResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: mintMinistryInvitationConflictSchema,
            422: mintMinistryInvitationUnprocessableSchema,
          },
        },
      },
      async (request, reply) => {
        if (await this.denyMissingMinistryFunction({ request, reply })) return;
        const { ministryId } = request.params as MinistryInvitationRouteParams;
        const body = request.body as z.infer<
          typeof mintMinistryInvitationBodySchema
        >;

        const churchId = ChurchId.from(request.churchId);
        const invitation = await this.ministryInvitationManager.mint({
          churchId,
          ministryId: MinistryId.from(ministryId),
          inviterId: UserId.from(request.userId),
          email: body.email,
          ministryAccessLevel: body.ministryAccessLevel,
          roleIds: body.roleIds.map((roleId) => RoleId.from(roleId)),
        });
        const deliveryStatus =
          await this.ministryInvitationManager.getDeliveryStatus({
            churchId,
            ministryInvitationId: invitation.id,
          });
        return reply
          .status(201)
          .send(
            ministryInvitationMapper.toResponse({ invitation, deliveryStatus }),
          );
      },
    );

    app.post(
      '/:ministryId/invitations/:invitationId/resend',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'resendMinistryInvitation',
          summary: 'Resend a Ministry Invitation',
          description:
            'Queue one fresh delivery of a pending or expired Ministry Invitation and restart its validity: the Ministry lifetime when standalone, or the Church lifetime for the Church Invitation and every still-pending Ministry Invitation sharing it. IDs, inviter, Access Levels and Roles are kept. A ChurchAdmin may resend any; a Ministry leader only volunteer-level invitations in Ministries they lead (403 INSUFFICIENT_INVITATION_AUTHORITY otherwise). Unmanaged, missing and other-Church targets are one 404. 409 INVITATION_NOT_PENDING when the invitation or its Church Invitation was already accepted, declined or revoked. 429 when the per-invitation cooldown or daily cap applies.',
          response: {
            200: ministryInvitationResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            429: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (await this.denyMissingMinistryFunction({ request, reply })) return;
        const { ministryId, invitationId } =
          request.params as MinistryInvitationActionRouteParams;

        const churchId = ChurchId.from(request.churchId);
        const invitation = await this.ministryInvitationManager.resend({
          churchId,
          ministryId: MinistryId.from(ministryId),
          ministryInvitationId: MinistryInvitationId.from(invitationId),
          callerId: UserId.from(request.userId),
        });
        const deliveryStatus =
          await this.ministryInvitationManager.getDeliveryStatus({
            churchId,
            ministryInvitationId: invitation.id,
          });
        return reply.send(
          ministryInvitationMapper.toResponse({ invitation, deliveryStatus }),
        );
      },
    );
    app.post(
      '/:ministryId/invitations/:invitationId/revoke',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'revokeMinistryInvitation',
          summary: 'Revoke a Ministry Invitation',
          description:
            'Revoke a pending or expired Ministry Invitation, recording the caller, the time and the reason `manual`; the body takes no actor or reason. Its Church Invitation is revoked too when no other pending Ministry Invitation still uses it. Accepted Memberships are untouched and no notice is sent. A ChurchAdmin may revoke any; a Ministry leader only volunteer-level invitations in Ministries they lead (403 INSUFFICIENT_INVITATION_AUTHORITY otherwise). Unmanaged, missing and other-Church targets are one 404. 409 INVITATION_NOT_PENDING when it was already accepted, declined or revoked.',
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
        if (await this.denyMissingMinistryFunction({ request, reply })) return;
        const { ministryId, invitationId } =
          request.params as MinistryInvitationActionRouteParams;

        await this.ministryInvitationManager.revoke({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          ministryInvitationId: MinistryInvitationId.from(invitationId),
          callerId: UserId.from(request.userId),
        });
        return reply.status(204).send(null);
      },
    );
  }

  /** Ministry lifecycle is ChurchAdmin-only, even for the target's leader. */
  private async denyNonAdmin({
    request,
    reply,
  }: DenyNonAdminInput): Promise<boolean> {
    const allowed = await this.authorityGuard.canManageChurch({
      churchId: ChurchId.from(request.churchId),
      userId: UserId.from(request.userId),
    });
    if (allowed) return false;
    refuse({ reply, request, code: 'FORBIDDEN' });
    return true;
  }

  /** A Ministry the admitted caller may not manage is indistinguishable from a missing one. */
  private async denyUnmanagedMinistry({
    request,
    reply,
    ministryId,
  }: DenyUnmanagedMinistryInput): Promise<boolean> {
    const decision = await this.authorityGuard.decideManageMinistry({
      churchId: ChurchId.from(request.churchId),
      userId: UserId.from(request.userId),
      ministryId,
    });
    if (decision.allowed) return false;
    refuse({ reply, request, code: 'NOT_FOUND' });
    return true;
  }

  /**
   * Returns whether access was denied. `FastifyReply` is thenable, so the
   * refusal is sent as a side effect and a plain boolean returned.
   */
  private async denyMissingMinistryFunction({
    request,
    reply,
  }: DenyMissingMinistryFunctionInput): Promise<boolean> {
    const decision = await this.authorityGuard.decideManageAnyMinistry({
      churchId: ChurchId.from(request.churchId),
      userId: UserId.from(request.userId),
    });
    if (decision.allowed) return false;
    refuse({ reply, request, code: 'FORBIDDEN' });
    return true;
  }
}
