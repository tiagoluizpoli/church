import 'reflect-metadata';
import { auth } from '@church/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import {
  AssignmentId,
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  PlanningCycleId,
  RoleId,
  ShiftId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { IAssignmentManager } from '../../domain/contracts/application/assignment-manager';
import type { IParticipationManager } from '../../domain/contracts/application/participation-manager';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { Assignment } from '../../domain/entities/assignment';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  assignmentMapper,
  assignmentResponseSchema,
  auditListResponseSchema,
} from '../dtos/assignment.dto';
import {
  cycleBuilderMapper,
  cycleBuilderResponseSchema,
  publishCycleBodySchema,
  publishCycleMapper,
  publishCycleResponseSchema,
} from '../dtos/cycle-builder.dto';
import {
  createParticipationAssignmentBodySchema,
  createParticipationAssignmentResponseSchema,
  eligibleVolunteerListResponseSchema,
  participationCompletionResponseSchema,
  publishParticipationBodySchema,
  reassignAssignmentBodySchema,
  rosteringMapper,
} from '../dtos/rostering.dto';
import { headersFromRequest } from '../utils/headers';

interface ParticipationRouteParams {
  participationId: string;
}

interface CycleRouteParams {
  cycleId: string;
}

interface CycleMinistryQuery {
  ministryId: string;
}

const cycleMinistryQuerySchema = z.object({
  ministryId: z.string(),
});

interface ShiftRouteParams {
  shiftId: string;
}

interface AssignmentRouteParams {
  assignmentId: string;
}

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

type CreateParticipationAssignmentBody = z.infer<
  typeof createParticipationAssignmentBodySchema
>;
type PublishParticipationBody = z.infer<typeof publishParticipationBodySchema>;
type PublishCycleBody = z.infer<typeof publishCycleBodySchema>;
type ReassignAssignmentBody = z.infer<typeof reassignAssignmentBodySchema>;

interface ResolveOwnedAssignmentInput {
  request: FastifyRequest;
  reply: FastifyReply;
  assignmentId: string;
}

interface ResolveOwnedAssignmentResult {
  assignment?: Assignment;
  denied: boolean;
}

interface DenyParticipationScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  participationId: string;
}

interface DenyShiftScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  shiftId: string;
}

@injectable()
export class LeaderRosteringController implements FastifyController {
  readonly prefix = '/leader';

  constructor(
    @inject('IParticipationManager')
    private readonly participationManager: IParticipationManager,
    @inject('IAssignmentManager')
    private readonly assignmentManager: IAssignmentManager,
    @inject('IVolunteerManager')
    private readonly volunteerManager: IVolunteerManager,
    @inject('AuthorityGuard')
    private readonly authorityGuard: AuthorityGuard,
  ) {}

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook('preValidation', async (request, reply) => {
      const headers = headersFromRequest(request);
      const session = await auth.api.getSession({ headers }).catch(() => null);
      if (!session?.user) {
        return reply
          .status(401)
          .send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const ctx = await this.volunteerManager.resolveVolunteerContext(
        UserId.from(session.user.id),
      );
      if (!ctx) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'Volunteer profile not found',
        });
      }

      request.userId = session.user.id;
      request.volunteerId = ctx.volunteerId;
      request.churchId = ctx.churchId;
    });

    app.get(
      '/cycles/:cycleId/builder',
      {
        schema: {
          tags: ['admin'],
          operationId: 'getCycleBuilderData',
          querystring: cycleMinistryQuerySchema,
          response: {
            200: cycleBuilderResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleRouteParams;
        const { ministryId } = request.query as CycleMinistryQuery;

        const allowed = await this.authorityGuard.canManageMinistry({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        if (!allowed) {
          return reply.status(403).send({
            error: 'FORBIDDEN',
            message: 'Not a leader of this ministry',
          });
        }

        const view = await this.participationManager.getCycleBuilderData({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        return reply.send(cycleBuilderMapper.toResponse(view));
      },
    );

    app.get(
      '/cycles/:cycleId/audit',
      {
        schema: {
          tags: ['admin'],
          operationId: 'getCycleAuditLog',
          querystring: cycleMinistryQuerySchema,
          response: {
            200: auditListResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleRouteParams;
        const { ministryId } = request.query as CycleMinistryQuery;

        const allowed = await this.authorityGuard.canManageMinistry({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        if (!allowed) {
          return reply.status(403).send({
            error: 'FORBIDDEN',
            message: 'Not a leader of this ministry',
          });
        }

        const items = await this.assignmentManager.listAuditLogForCycle({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
        });
        return reply.send(assignmentMapper.auditListToResponse(items));
      },
    );

    app.post(
      '/cycles/:cycleId/publish',
      {
        schema: {
          tags: ['admin'],
          operationId: 'publishCycle',
          querystring: cycleMinistryQuerySchema,
          body: publishCycleBodySchema,
          response: {
            200: publishCycleResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleRouteParams;
        const { ministryId } = request.query as CycleMinistryQuery;

        const allowed = await this.authorityGuard.canManageMinistry({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        if (!allowed) {
          return reply.status(403).send({
            error: 'FORBIDDEN',
            message: 'Not a leader of this ministry',
          });
        }

        const body = request.body as PublishCycleBody;
        const view = await this.participationManager.publishCycle({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
          confirmBelowFull: body.confirmBelowFull,
        });
        return reply.send(publishCycleMapper.toResponse(view));
      },
    );

    app.get(
      '/shifts/:shiftId/eligible-volunteers',
      {
        schema: {
          tags: ['admin'],
          operationId: 'listEligibleVolunteers',
          response: {
            200: eligibleVolunteerListResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { shiftId } = request.params as ShiftRouteParams;
        const denied = await this.denyShiftScope({ request, reply, shiftId });
        if (denied) return;

        const volunteers =
          await this.participationManager.listEligibleVolunteers({
            churchId: ChurchId.from(request.churchId),
            shiftId: ShiftId.from(shiftId),
          });
        return reply.send(
          rosteringMapper.eligibleVolunteerListToResponse(volunteers),
        );
      },
    );

    app.post(
      '/shifts/:shiftId/assignments',
      {
        schema: {
          tags: ['admin'],
          operationId: 'createParticipationAssignment',
          body: createParticipationAssignmentBodySchema,
          response: {
            201: createParticipationAssignmentResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { shiftId } = request.params as ShiftRouteParams;
        const denied = await this.denyShiftScope({ request, reply, shiftId });
        if (denied) return;

        const body = request.body as CreateParticipationAssignmentBody;
        const result =
          await this.assignmentManager.createParticipationAssignment({
            churchId: ChurchId.from(request.churchId),
            shiftId: ShiftId.from(shiftId),
            volunteerId: VolunteerId.from(body.volunteerId),
            roleId: RoleId.from(body.roleId),
            teamId: body.teamId,
            actorId: UserId.from(request.userId),
            override: body.override,
          });
        return reply
          .status(201)
          .send(rosteringMapper.assignmentResultToResponse(result));
      },
    );

    app.delete(
      '/assignments/:assignmentId',
      {
        schema: {
          tags: ['admin'],
          operationId: 'deleteParticipationAssignment',
          response: { 204: z.null(), 403: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as AssignmentRouteParams;
        const resolved = await this.resolveOwnedAssignment({
          request,
          reply,
          assignmentId,
        });
        if (resolved.denied) return;

        await this.assignmentManager.deleteAssignment({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: ChurchId.from(request.churchId),
          actorId: UserId.from(request.userId),
        });
        return reply.status(204).send(null);
      },
    );

    app.patch(
      '/assignments/:assignmentId/reassign',
      {
        schema: {
          tags: ['admin'],
          operationId: 'reassignParticipationAssignment',
          body: reassignAssignmentBodySchema,
          response: {
            200: assignmentResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as AssignmentRouteParams;
        const resolved = await this.resolveOwnedAssignment({
          request,
          reply,
          assignmentId,
        });
        if (resolved.denied) return;

        const body = request.body as ReassignAssignmentBody;
        const reassigned =
          await this.assignmentManager.reassignParticipationAssignment({
            churchId: ChurchId.from(request.churchId),
            assignmentId: AssignmentId.from(assignmentId),
            volunteerId: VolunteerId.from(body.volunteerId),
            actorId: UserId.from(request.userId),
            reason: body.reason,
          });
        return reply.send(assignmentMapper.toResponse(reassigned));
      },
    );

    app.get(
      '/participations/:participationId/completion',
      {
        schema: {
          tags: ['admin'],
          operationId: 'getParticipationCompletion',
          response: {
            200: participationCompletionResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { participationId } = request.params as ParticipationRouteParams;
        const denied = await this.denyParticipationScope({
          request,
          reply,
          participationId,
        });
        if (denied) return;

        const completion = await this.participationManager.getCompletion({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
        });
        return reply.send(rosteringMapper.completionToResponse(completion));
      },
    );

    app.post(
      '/participations/:participationId/publish',
      {
        schema: {
          tags: ['admin'],
          operationId: 'publishParticipation',
          body: publishParticipationBodySchema,
          response: { 204: z.null(), 403: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const { participationId } = request.params as ParticipationRouteParams;
        const denied = await this.denyParticipationScope({
          request,
          reply,
          participationId,
        });
        if (denied) return;

        const body = request.body as PublishParticipationBody;
        await this.participationManager.publish({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
          confirmBelowFull: body.confirmBelowFull,
        });
        return reply.status(204).send(null);
      },
    );
  }

  /**
   * Returns whether access was denied. `FastifyReply` is a thenable (it
   * resolves once the response is flushed) — `return reply.send(...)` from
   * an `async` method would have its own returned promise silently adopt
   * that reply's resolution instead of the reply object itself, so callers
   * must never `await` a reply and branch on the awaited value. Each guard
   * here sends the 403 as a side effect and returns a plain boolean.
   */
  private async denyParticipationScope({
    request,
    reply,
    participationId,
  }: DenyParticipationScopeInput): Promise<boolean> {
    const allowed = await this.authorityGuard.canManageParticipation({
      churchId: ChurchId.from(request.churchId),
      participationId: MinistryParticipationId.from(participationId),
      userId: UserId.from(request.userId),
    });
    if (allowed) {
      return false;
    }

    reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Participation belongs to another ministry',
    });
    return true;
  }

  private async resolveOwnedAssignment({
    request,
    reply,
    assignmentId,
  }: ResolveOwnedAssignmentInput): Promise<ResolveOwnedAssignmentResult> {
    const assignment = await this.assignmentManager.getAssignment({
      churchId: ChurchId.from(request.churchId),
      assignmentId: AssignmentId.from(assignmentId),
    });
    const denied = await this.denyShiftScope({
      request,
      reply,
      shiftId: assignment.shiftId as string,
    });
    if (denied) {
      return { denied: true };
    }

    return { assignment, denied: false };
  }

  private async denyShiftScope({
    request,
    reply,
    shiftId,
  }: DenyShiftScopeInput): Promise<boolean> {
    const allowed = await this.authorityGuard.canManageShift({
      churchId: ChurchId.from(request.churchId),
      shiftId: ShiftId.from(shiftId),
      userId: UserId.from(request.userId),
    });
    if (allowed) {
      return false;
    }

    reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Shift belongs to another ministry',
    });
    return true;
  }
}
