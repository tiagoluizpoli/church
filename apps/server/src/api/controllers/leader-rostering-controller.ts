import 'reflect-metadata';
import { auth } from '@church/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import {
  AssignmentId,
  ChurchId,
  MinistryParticipationId,
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
import type { SchedulingRbacGuard } from '../auth/scheduling-rbac-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  assignmentMapper,
  assignmentResponseSchema,
} from '../dtos/assignment.dto';
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
type ReassignAssignmentBody = z.infer<typeof reassignAssignmentBodySchema>;

interface ResolveOwnedAssignmentInput {
  request: FastifyRequest;
  reply: FastifyReply;
  assignmentId: string;
}

interface ResolveOwnedAssignmentResult {
  assignment?: Assignment;
  denied?: FastifyReply;
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
    @inject('SchedulingRbacResolver')
    private readonly rbacGuard: SchedulingRbacGuard,
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

      if (!ctx.isLeader && !ctx.isAdmin) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Ministry leader role required',
        });
      }

      request.userId = session.user.id;
      request.volunteerId = ctx.volunteerId;
      request.churchId = ctx.churchId;
    });

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
        const denied = await this.denyShiftScope(request, reply, shiftId);
        if (denied) return denied;

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
        const denied = await this.denyShiftScope(request, reply, shiftId);
        if (denied) return denied;

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
        if (resolved.denied) return resolved.denied;

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
        if (resolved.denied) return resolved.denied;

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
        const denied = await this.denyParticipationScope(
          request,
          reply,
          participationId,
        );
        if (denied) return denied;

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
        const denied = await this.denyParticipationScope(
          request,
          reply,
          participationId,
        );
        if (denied) return denied;

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

  private async denyParticipationScope(
    request: FastifyRequest,
    reply: FastifyReply,
    participationId: string,
  ) {
    const allowed = await this.rbacGuard.canManageParticipation({
      churchId: ChurchId.from(request.churchId),
      participationId: MinistryParticipationId.from(participationId),
      userId: UserId.from(request.userId),
    });
    if (allowed) {
      return undefined;
    }

    return reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Participation belongs to another ministry',
    });
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
    const denied = await this.denyShiftScope(
      request,
      reply,
      assignment.shiftId as string,
    );
    if (denied) {
      return { denied };
    }

    return { assignment };
  }

  private async denyShiftScope(
    request: FastifyRequest,
    reply: FastifyReply,
    shiftId: string,
  ) {
    const allowed = await this.rbacGuard.canManageShift({
      churchId: ChurchId.from(request.churchId),
      shiftId: ShiftId.from(shiftId),
      userId: UserId.from(request.userId),
    });
    if (allowed) {
      return undefined;
    }

    return reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Shift belongs to another ministry',
    });
  }
}
