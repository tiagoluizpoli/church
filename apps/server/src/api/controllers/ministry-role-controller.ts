import { z } from 'zod';
import { MinistryId, RoleId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IMinistryRoleManager } from '../../domain/contracts/application/ministry-role-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import { assertMinistryManagement } from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import { archiveBlockedResponseSchema } from '../dtos/archive-blocker.dto';
import {
  authErrorResponses,
  errorResponseSchema,
} from '../dtos/error-response.dto';
import { ministryParamsSchema } from '../dtos/id.dto';
import {
  ministryRoleParamsSchema,
  roleListResponseSchema,
  roleMapper,
  roleNameBodySchema,
  roleResponseSchema,
} from '../dtos/ministry-role.dto';
import type { MinistryRoleControllerDependencies } from './ministry-role-controller.types';

/**
 * The Role registry of a Ministry, for ChurchAdmins and the Ministry's own
 * leaders. The collection read is the active-choice read later specs reuse.
 */
export class MinistryRoleController implements FastifyController {
  readonly prefix = '/ministries';

  private readonly ministryRoleManager: IMinistryRoleManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly sessionGateway: SessionGateway;
  private readonly authorityGuard: IAuthorityGuard;

  constructor({
    ministryRoleManager,
    activeChurchResolver,
    sessionGateway,
    authorityGuard,
  }: MinistryRoleControllerDependencies) {
    this.ministryRoleManager = ministryRoleManager;
    this.activeChurchResolver = activeChurchResolver;
    this.sessionGateway = sessionGateway;
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
        sessionGateway: this.sessionGateway,
      }),
    );
    const authorityGuard = this.authorityGuard;

    app.get(
      '/:ministryId/roles',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'listMinistryRoles',
          params: ministryParamsSchema,
          summary: "List a Ministry's active Roles",
          description:
            'Active Roles of a managed Ministry, alphabetical ignoring case. The active-choice read for new invitations, memberships and headcounts.',
          response: {
            200: roleListResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = MinistryId.from(request.params.ministryId);
        await assertMinistryManagement({
          authorityGuard,
          request,
          ministryId,
        });
        const roles = await this.ministryRoleManager.list({
          churchId: request.churchId,
          ministryId,
        });
        return reply.send(roleMapper.toResponseList(roles));
      },
    );

    app.post(
      '/:ministryId/roles',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'createMinistryRole',
          params: ministryParamsSchema,
          summary: 'Add a Role to a Ministry',
          description:
            'Add an active Role by name. Active Role names are unique per Ministry ignoring case.',
          body: roleNameBodySchema,
          response: {
            201: roleResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = MinistryId.from(request.params.ministryId);
        await assertMinistryManagement({
          authorityGuard,
          request,
          ministryId,
        });
        const { name } = request.body;
        const role = await this.ministryRoleManager.create({
          churchId: request.churchId,
          ministryId,
          name,
        });
        return reply.status(201).send(roleMapper.toResponse(role));
      },
    );

    app.patch(
      '/:ministryId/roles/:roleId',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'renameMinistryRole',
          params: ministryRoleParamsSchema,
          summary: 'Rename a Role',
          description:
            'Rename an active Role, keeping its identity, qualifications and history.',
          body: roleNameBodySchema,
          response: {
            200: roleResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { params } = request;
        const ministryId = MinistryId.from(params.ministryId);
        await assertMinistryManagement({
          authorityGuard,
          request,
          ministryId,
        });
        const { name } = request.body;
        const role = await this.ministryRoleManager.rename({
          churchId: request.churchId,
          ministryId,
          roleId: RoleId.from(params.roleId),
          name,
        });
        return reply.send(roleMapper.toResponse(role));
      },
    );

    app.post(
      '/:ministryId/roles/:roleId/archive',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'archiveMinistryRole',
          params: ministryRoleParamsSchema,
          summary: 'Archive a Role',
          description:
            'Hide a Role from new use, keeping qualifications, Memberships and Assignments. Refused with blockers while an upcoming ShiftRequirement or a UsualSetup headcount uses it.',
          response: {
            204: z.null(),
            ...authErrorResponses,
            404: errorResponseSchema,
            409: archiveBlockedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { params } = request;
        const ministryId = MinistryId.from(params.ministryId);
        await assertMinistryManagement({
          authorityGuard,
          request,
          ministryId,
        });
        await this.ministryRoleManager.archive({
          churchId: request.churchId,
          ministryId,
          roleId: RoleId.from(params.roleId),
        });
        return reply.status(204).send(null);
      },
    );
  }
}
