import { z } from 'zod';
import { ChurchId, MinistryId, RoleId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IMinistryRoleManager } from '../../domain/contracts/application/ministry-role-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import { denyMinistryManagement } from '../auth/ministry-management-access';
import type { FastifyController } from '../contracts/fastify-controller';
import { archiveBlockedResponseSchema } from '../dtos/archive-blocker.dto';
import {
  type RoleNameBody,
  roleListResponseSchema,
  roleMapper,
  roleNameBodySchema,
  roleResponseSchema,
} from '../dtos/ministry-role.dto';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

interface MinistryRolesRouteParams {
  ministryId: string;
}

interface MinistryRoleRouteParams extends MinistryRolesRouteParams {
  roleId: string;
}

interface MinistryRoleControllerDependencies {
  ministryRoleManager: IMinistryRoleManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
}

/**
 * The Role registry of a Ministry, for ChurchAdmins and the Ministry's own
 * leaders. The collection read is the active-choice read later specs reuse.
 */
export class MinistryRoleController implements FastifyController {
  readonly prefix = '/ministries';

  private readonly ministryRoleManager: IMinistryRoleManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;

  constructor({
    ministryRoleManager,
    activeChurchResolver,
    authorityGuard,
  }: MinistryRoleControllerDependencies) {
    this.ministryRoleManager = ministryRoleManager;
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
    const authorityGuard = this.authorityGuard;

    app.get(
      '/:ministryId/roles',
      {
        schema: {
          tags: ['ministries'],
          operationId: 'listMinistryRoles',
          summary: "List a Ministry's active Roles",
          description:
            'Active Roles of a managed Ministry, alphabetical ignoring case. The active-choice read for new invitations, memberships and headcounts.',
          response: {
            200: roleListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = MinistryId.from(
          (request.params as MinistryRolesRouteParams).ministryId,
        );
        if (
          await denyMinistryManagement({
            authorityGuard,
            request,
            reply,
            ministryId,
          })
        ) {
          return;
        }
        const roles = await this.ministryRoleManager.list({
          churchId: ChurchId.from(request.churchId),
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
          summary: 'Add a Role to a Ministry',
          description:
            'Add an active Role by name. Active Role names are unique per Ministry ignoring case.',
          body: roleNameBodySchema,
          response: {
            201: roleResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const ministryId = MinistryId.from(
          (request.params as MinistryRolesRouteParams).ministryId,
        );
        if (
          await denyMinistryManagement({
            authorityGuard,
            request,
            reply,
            ministryId,
          })
        ) {
          return;
        }
        const { name } = request.body as RoleNameBody;
        const role = await this.ministryRoleManager.create({
          churchId: ChurchId.from(request.churchId),
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
          summary: 'Rename a Role',
          description:
            'Rename an active Role, keeping its identity, qualifications and history.',
          body: roleNameBodySchema,
          response: {
            200: roleResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const params = request.params as MinistryRoleRouteParams;
        const ministryId = MinistryId.from(params.ministryId);
        if (
          await denyMinistryManagement({
            authorityGuard,
            request,
            reply,
            ministryId,
          })
        ) {
          return;
        }
        const { name } = request.body as RoleNameBody;
        const role = await this.ministryRoleManager.rename({
          churchId: ChurchId.from(request.churchId),
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
          summary: 'Archive a Role',
          description:
            'Hide a Role from new use, keeping qualifications, Memberships and Assignments. Refused with blockers while an upcoming ShiftRequirement or a UsualSetup headcount uses it.',
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
        const params = request.params as MinistryRoleRouteParams;
        const ministryId = MinistryId.from(params.ministryId);
        if (
          await denyMinistryManagement({
            authorityGuard,
            request,
            reply,
            ministryId,
          })
        ) {
          return;
        }
        await this.ministryRoleManager.archive({
          churchId: ChurchId.from(request.churchId),
          ministryId,
          roleId: RoleId.from(params.roleId),
        });
        return reply.status(204).send(null);
      },
    );
  }
}
