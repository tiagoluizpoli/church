import { z } from 'zod';
import {
  MinistryId,
  MinistryInvitationId,
  RoleId,
  type VolunteerId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryInvitationManager } from '../../domain/contracts/application/ministry-invitation-manager';
import type { IMinistryManager } from '../../domain/contracts/application/ministry-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import {
  assertMinistryFunction,
  assertMinistryManagement,
  createChurchAdminHook,
  resolveLeadershipScope,
} from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import { archiveBlockedResponseSchema } from '../dtos/archive-blocker.dto';
import {
  authErrorResponses,
  errorResponseSchema,
} from '../dtos/error-response.dto';
import { ministryParamsSchema } from '../dtos/id.dto';
import {
  ministryInvitationParamsSchema,
  ministryListResponseSchema,
  ministryMapper,
  ministryNameBodySchema,
  ministryPageQuerystringSchema,
  ministryPageResponseSchema,
  ministryResponseSchema,
} from '../dtos/ministry.dto';
import {
  ministryInvitationMapper,
  ministryInvitationResponseSchema,
  mintMinistryInvitationBodySchema,
  mintMinistryInvitationConflictSchema,
  mintMinistryInvitationUnprocessableSchema,
} from '../dtos/ministry-invitation.dto';
import { pageLimitSchema } from '../dtos/page-limit.dto';
import { requestCaller } from '../utils/request-caller';
import type { MinistryControllerDependencies } from './ministry-controller.types';

export class MinistryController implements FastifyController {
  readonly prefix = '/ministries';

  private readonly ministryManager: IMinistryManager;
  private readonly ministryInvitationManager: IMinistryInvitationManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;
  private readonly pageSize: number;
  private readonly maxPageSize: number;

  constructor({
    ministryManager,
    ministryInvitationManager,
    activeChurchResolver,
    authorityGuard,
    config,
  }: MinistryControllerDependencies) {
    this.ministryManager = ministryManager;
    this.ministryInvitationManager = ministryInvitationManager;
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
    this.pageSize = config.ministries.pageSize;
    this.maxPageSize = config.ministries.maxPageSize;
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
    const churchAdminOnly = createChurchAdminHook({
      authorityGuard: this.authorityGuard,
    });

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
            ...authErrorResponses,
          },
        },
      },
      async (request, reply) => {
        const { churchId } = request;
        const scope = await resolveLeadershipScope({
          authorityGuard: this.authorityGuard,
          request,
        });
        const ministries =
          scope.kind === 'church'
            ? await this.ministryManager.listByChurch(churchId)
            : await this.ministryManager.listByLeader({
                churchId,
                leaderId: request.volunteerId as VolunteerId,
              });
        const summaries = await this.ministryManager.summarize({
          churchId,
          ministries,
        });
        return reply.send(
          ministryMapper.toResponseList({ ministries, summaries }),
        );
      },
    );

    app.get(
      '/directory',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'listMinistryDirectory',
          summary: 'List the Ministries management page',
          description:
            "One page of the caller's accessible Ministries, alphabetical ignoring case: every Ministry for a ChurchAdmin, or the Ministries the caller actively leads. Search (trimmed, case-insensitive literal name substring) and status (`review`: a Usual setup block needs review; `no-sectors`: no active Sector) combine before pagination. `counts` covers the caller's whole scope: it ignores the filters and the cursor, so every page repeats the same values.",
          querystring: ministryPageQuerystringSchema.extend({
            limit: pageLimitSchema({ maxPageSize: this.maxPageSize }).default(
              this.pageSize,
            ),
          }),
          response: {
            200: ministryPageResponseSchema,
            ...authErrorResponses,
          },
        },
      },
      async (request, reply) => {
        const scope = await resolveLeadershipScope({
          authorityGuard: this.authorityGuard,
          request,
        });
        const page = await this.ministryManager.listPage({
          ...request.query,
          churchId: request.churchId,
          ministryIds: scope.kind === 'church' ? undefined : scope.ministryIds,
        });
        return reply.send(ministryMapper.toPageResponse(page));
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
            ...authErrorResponses,
            409: errorResponseSchema,
          },
        },
        preHandler: churchAdminOnly,
      },
      async (request, reply) => {
        const { name } = request.body;
        const ministry = await this.ministryManager.create({
          churchId: request.churchId,
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
          params: ministryParamsSchema,
          summary: 'Get a managed Ministry',
          description:
            'Get an active Ministry the caller manages: any for a ChurchAdmin, a led one for a Ministry leader.',
          response: {
            200: ministryResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = MinistryId.from(request.params.ministryId);
        const { authorityGuard } = this;
        await assertMinistryManagement({
          authorityGuard,
          request,
          ministryId,
        });
        const ministry = await this.ministryManager.getActive({
          churchId: request.churchId,
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
          params: ministryParamsSchema,
          summary: 'Rename a Ministry',
          description:
            'Rename an active Ministry, keeping its identity. ChurchAdmin only; active names are unique ignoring case.',
          body: ministryNameBodySchema,
          response: {
            200: ministryResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
        preHandler: churchAdminOnly,
      },
      async (request, reply) => {
        const { ministryId } = request.params;
        const { name } = request.body;
        const ministry = await this.ministryManager.rename({
          churchId: request.churchId,
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
          params: ministryParamsSchema,
          summary: 'Archive a Ministry',
          description:
            'Archive an active Ministry, keeping its history and freeing its name. In the same transaction, every pending Ministry Invitation to it (expired included) is revoked as the caller with the reason `ministry-archived`, and so is its Church Invitation when no other pending Ministry Invitation still uses it; accepted Memberships are untouched and no notice is sent. ChurchAdmin only; refused with the blocking Cycles while it participates in an Event that has not ended, changing nothing.',
          response: {
            204: z.null(),
            ...authErrorResponses,
            404: errorResponseSchema,
            409: archiveBlockedResponseSchema,
          },
        },
        preHandler: churchAdminOnly,
      },
      async (request, reply) => {
        const { ministryId } = request.params;
        await this.ministryManager.archive({
          churchId: request.churchId,
          ministryId: MinistryId.from(ministryId),
          callerId: request.userId,
        });
        return reply.status(204).send(null);
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
          params: ministryParamsSchema,
          summary: 'Mint a Ministry Invitation',
          description:
            'Create a Ministry Invitation granting a Ministry Access Level and Roles to an emailed recipient.',
          body: mintMinistryInvitationBodySchema,
          response: {
            201: ministryInvitationResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            409: mintMinistryInvitationConflictSchema,
            422: mintMinistryInvitationUnprocessableSchema,
          },
        },
      },
      async (request, reply) => {
        const { authorityGuard } = this;
        await assertMinistryFunction({ authorityGuard, request });
        const { ministryId } = request.params;
        const body = request.body;

        const {
          churchId,
          userId: inviterId,
          actor,
        } = requestCaller({ request });
        const invitation = await this.ministryInvitationManager.mint({
          churchId,
          ministryId: MinistryId.from(ministryId),
          inviterId,
          actor,
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
          params: ministryInvitationParamsSchema,
          summary: 'Resend a Ministry Invitation',
          description:
            'Queue one fresh delivery of a pending or expired Ministry Invitation and restart its validity: the Ministry lifetime when standalone, or the Church lifetime for the Church Invitation and every still-pending Ministry Invitation sharing it. IDs, inviter, Access Levels and Roles are kept. A ChurchAdmin may resend any; a Ministry leader only volunteer-level invitations in Ministries they lead (403 INSUFFICIENT_INVITATION_AUTHORITY otherwise). Unmanaged, missing and other-Church targets are one 404. 409 INVITATION_NOT_PENDING when the invitation or its Church Invitation was already accepted, declined or revoked. 429 when the per-invitation cooldown or daily cap applies.',
          response: {
            200: ministryInvitationResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            409: errorResponseSchema,
            429: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { authorityGuard } = this;
        await assertMinistryFunction({ authorityGuard, request });
        const { ministryId, invitationId } = request.params;

        const {
          churchId,
          userId: callerId,
          actor,
        } = requestCaller({ request });
        const invitation = await this.ministryInvitationManager.resend({
          churchId,
          ministryId: MinistryId.from(ministryId),
          ministryInvitationId: MinistryInvitationId.from(invitationId),
          callerId,
          actor,
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
          params: ministryInvitationParamsSchema,
          summary: 'Revoke a Ministry Invitation',
          description:
            'Revoke a pending or expired Ministry Invitation, recording the caller, the time and the reason `manual`; the body takes no actor or reason. Its Church Invitation is revoked too when no other pending Ministry Invitation still uses it. Accepted Memberships are untouched and no notice is sent. A ChurchAdmin may revoke any; a Ministry leader only volunteer-level invitations in Ministries they lead (403 INSUFFICIENT_INVITATION_AUTHORITY otherwise). Unmanaged, missing and other-Church targets are one 404. 409 INVITATION_NOT_PENDING when it was already accepted, declined or revoked.',
          response: {
            204: z.null(),
            ...authErrorResponses,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { authorityGuard } = this;
        await assertMinistryFunction({ authorityGuard, request });
        const { ministryId, invitationId } = request.params;

        const {
          churchId,
          userId: callerId,
          actor,
        } = requestCaller({ request });
        await this.ministryInvitationManager.revoke({
          churchId,
          ministryId: MinistryId.from(ministryId),
          ministryInvitationId: MinistryInvitationId.from(invitationId),
          callerId,
          actor,
        });
        return reply.status(204).send(null);
      },
    );
  }
}
