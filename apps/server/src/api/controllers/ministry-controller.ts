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
import {
  ministryListResponseSchema,
  ministryMapper,
} from '../dtos/ministry.dto';
import {
  ministryInvitationMapper,
  ministryInvitationResponseSchema,
  mintMinistryInvitationBodySchema,
} from '../dtos/ministry-invitation.dto';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

interface MinistryInvitationRouteParams {
  ministryId: string;
}

interface ResendMinistryInvitationRouteParams {
  ministryId: string;
  invitationId: string;
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
          reply.status(403).send({
            error: 'FORBIDDEN',
            message: 'Ministry leadership required',
          });
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

    // Ministry Invitation routes — reachable by ChurchAdmin or Ministry
    // leader alike, so they live here rather than under a role-specific
    // controller; `DbMinistryInvitationManager` derives and enforces the
    // caller's actual authority itself (indistinguishable 404 on any
    // unauthorized/nonexistent/cross-Church Ministry), so no guard call is
    // needed at this layer.
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
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
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
          description: 'Resend the delivery email for a Ministry Invitation.',
          response: {
            200: ministryInvitationResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ministryId, invitationId } =
          request.params as ResendMinistryInvitationRouteParams;

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
  }
}
