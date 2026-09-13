import 'reflect-metadata';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { inject, injectable } from 'tsyringe';
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

interface DenySchedulingAccessInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

interface DenyMissingVolunteerProfileInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

@injectable()
export class MinistryController implements FastifyController {
  readonly prefix = '/ministries';

  constructor(
    @inject('IMinistryManager')
    private readonly ministryManager: IMinistryManager,
    @inject('IMinistryInvitationManager')
    private readonly ministryInvitationManager: IMinistryInvitationManager,
    @inject('IActiveChurchResolver')
    private readonly activeChurchResolver: IActiveChurchResolver,
    @inject('AuthorityGuard')
    private readonly authorityGuard: AuthorityGuard,
  ) {}

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
          response: {
            200: ministryListResponseSchema,
            401: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const deniedProfile = await this.denyMissingVolunteerProfile({
          request,
          reply,
        });
        if (deniedProfile) return;

        const denied = await this.denySchedulingAccess({ request, reply });
        if (denied) return;

        const ministries = await this.ministryManager.listByLeader({
          leaderId: VolunteerId.from(request.volunteerId as string),
          churchId: ChurchId.from(request.churchId),
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

  /**
   * `/ministries` is the only route here that reads `request.volunteerId`
   * (leader-scoped listing) — the Ministry-invitation routes are pure
   * Church-authority operations a Volunteer-less ChurchAdmin must still
   * reach, so the profile requirement is scoped to just this route instead
   * of the controller's shared preValidation hook.
   */
  private async denyMissingVolunteerProfile({
    request,
    reply,
  }: DenyMissingVolunteerProfileInput): Promise<boolean> {
    if (request.volunteerId) return false;

    reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Volunteer profile not found',
    });
    return true;
  }

  /**
   * Returns whether access was denied. `FastifyReply` is a thenable (it
   * resolves once the response is flushed) — `return reply.send(...)` from
   * an `async` method would have its own returned promise silently adopt
   * that reply's resolution instead of the reply object itself, so callers
   * must never `await` a reply and branch on the awaited value. Each guard
   * here sends the 403 as a side effect and returns a plain boolean.
   *
   * Gates the frontend's nav-visibility probe (`useCallerRoles`): there is
   * no "my roles" endpoint, so the caller derives whether it may see
   * Scheduling nav from whether this lightweight query is forbidden.
   */
  private async denySchedulingAccess({
    request,
    reply,
  }: DenySchedulingAccessInput): Promise<boolean> {
    const allowed = await this.authorityGuard.hasSchedulingAccess({
      churchId: ChurchId.from(request.churchId),
      userId: UserId.from(request.userId),
    });
    if (allowed) return false;

    reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Admin or leader role required',
    });
    return true;
  }
}
