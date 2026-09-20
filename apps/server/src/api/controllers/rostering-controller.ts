import 'reflect-metadata';
import { NotFoundError } from '@church/core';
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
  TeamId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAssignmentManager } from '../../domain/contracts/application/assignment-manager';
import type { IParticipationManager } from '../../domain/contracts/application/participation-manager';
import type { Assignment } from '../../domain/entities/assignment';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
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

interface ParticipationRouteParams {
  participationId: string;
}

interface CycleRouteParams {
  cycleId: string;
}

interface TeamRouteParams {
  teamId: string;
}

interface CycleMinistryQuery {
  ministryId: string;
  teamId?: string;
}

const cycleMinistryQuerySchema = z.object({
  ministryId: z.string(),
  teamId: z.string().optional(),
});

interface ShiftRouteParams {
  shiftId: string;
}

interface AssignmentRouteParams {
  assignmentId: string;
}

interface AssignmentMutationQuery {
  teamId?: string;
}

const assignmentMutationQuerySchema = z.object({
  teamId: z.string().optional(),
});

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

const teamRosterCycleListResponseSchema = z.object({
  cycles: z.array(
    z.object({
      cycleId: z.string(),
      name: z.string(),
    }),
  ),
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

interface ResolveRosterAssignmentInput extends ResolveOwnedAssignmentInput {
  teamId?: string;
}

interface ResolveRosterAssignmentResult extends ResolveOwnedAssignmentResult {
  teamLeaderScopeId?: TeamId;
}

interface ResolveRosterShiftInput {
  request: FastifyRequest;
  reply: FastifyReply;
  shiftId: string;
  teamId?: string;
}

interface ResolveRosterShiftResult {
  denied: boolean;
  teamLeaderScopeId?: TeamId;
}

interface DenyRosterActionInput {
  reply: FastifyReply;
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

interface CanReadCycleBuilderInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  teamId?: TeamId;
  userId: UserId;
}

@injectable()
export class RosteringController implements FastifyController {
  readonly prefix = '/rostering';

  constructor(
    @inject('IParticipationManager')
    private readonly participationManager: IParticipationManager,
    @inject('IAssignmentManager')
    private readonly assignmentManager: IAssignmentManager,
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
      createActiveChurchPreValidation({ resolver: this.activeChurchResolver }),
    );

    app.get(
      '/teams/:teamId/cycles-summary',
      {
        schema: {
          tags: ['rostering'],
          operationId: 'listTeamRosterCycles',
          summary: "List a Team's readable roster cycles",
          description:
            'List the locked PlanningCycles in a Ministry that a TeamLeader may open as a read-only roster.',
          querystring: cycleMinistryQuerySchema,
          response: {
            200: teamRosterCycleListResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { teamId } = request.params as TeamRouteParams;
        const { ministryId } = request.query as CycleMinistryQuery;
        const allowed = await this.authorityGuard.canManageTeam({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          teamId: TeamId.from(teamId),
          userId: UserId.from(request.userId),
        });
        if (!allowed) {
          return reply.status(403).send({
            error: 'FORBIDDEN',
            message: 'Not a leader of this team',
          });
        }
        const cycles =
          await this.participationManager.listMinistryCycleSummaries({
            churchId: ChurchId.from(request.churchId),
            ministryId: MinistryId.from(ministryId),
            teamId: TeamId.from(teamId),
          });
        return reply.send({
          cycles: cycles.map((cycle) => ({
            cycleId: cycle.cycleId,
            name: cycle.name,
          })),
        });
      },
    );

    app.get(
      '/cycles/:cycleId/builder',
      {
        schema: {
          tags: ['rostering'],
          operationId: 'getCycleBuilderData',
          summary: 'Get cycle builder data for a Ministry',
          description:
            "Get a Ministry's roster-building view of a PlanningCycle: its MinistryParticipations, Shifts, SlotRequirements, and Assignments.",
          querystring: cycleMinistryQuerySchema,
          response: {
            200: cycleBuilderResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleRouteParams;
        const { ministryId, teamId } = request.query as CycleMinistryQuery;

        const allowed = await this.canReadCycleBuilder({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          teamId: teamId ? TeamId.from(teamId) : undefined,
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
          teamId: teamId ? TeamId.from(teamId) : undefined,
          userId: UserId.from(request.userId),
        });
        return reply.send(cycleBuilderMapper.toResponse(view));
      },
    );

    app.get(
      '/cycles/:cycleId/audit',
      {
        schema: {
          tags: ['rostering'],
          operationId: 'getCycleAuditLog',
          summary: "Get a Ministry's Assignment audit log for a cycle",
          description:
            "List a Ministry's Assignment audit entries across an entire PlanningCycle.",
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
          tags: ['rostering'],
          operationId: 'publishCycle',
          summary: "Publish a Ministry's roster for a cycle",
          description:
            'Publish every eligible MinistryParticipation in a PlanningCycle for a Ministry in one batch, making its rosters visible to Volunteers.',
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
          tags: ['rostering'],
          operationId: 'listEligibleVolunteers',
          summary: 'List eligible Volunteers for a Shift',
          description:
            'List the Volunteers eligible to be assigned to a Shift, for the roster builder.',
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
          tags: ['rostering'],
          operationId: 'createParticipationAssignment',
          summary: 'Assign a Volunteer to a Shift',
          description:
            'Assign a Volunteer to a Role (and optional Team) within a Shift, optionally overriding a detected conflict.',
          body: createParticipationAssignmentBodySchema,
          response: {
            201: createParticipationAssignmentResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { shiftId } = request.params as ShiftRouteParams;
        const body = request.body as CreateParticipationAssignmentBody;
        const scope = await this.resolveRosterShift({
          request,
          reply,
          shiftId,
          teamId: body.teamId,
        });
        if (scope.denied) return;

        const result =
          await this.assignmentManager.createParticipationAssignment({
            churchId: ChurchId.from(request.churchId),
            shiftId: ShiftId.from(shiftId),
            volunteerId: VolunteerId.from(body.volunteerId),
            roleId: RoleId.from(body.roleId),
            teamId: body.teamId ? TeamId.from(body.teamId) : undefined,
            teamLeaderScopeId: scope.teamLeaderScopeId,
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
          tags: ['rostering'],
          operationId: 'deleteParticipationAssignment',
          summary: 'Delete an Assignment',
          description: 'Remove a Volunteer Assignment from its Shift.',
          querystring: assignmentMutationQuerySchema,
          response: { 204: z.null(), 403: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as AssignmentRouteParams;
        const { teamId } = request.query as AssignmentMutationQuery;
        const resolved = await this.resolveRosterAssignment({
          request,
          reply,
          assignmentId,
          teamId,
        });
        if (resolved.denied) return;

        await this.assignmentManager.deleteAssignment({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: ChurchId.from(request.churchId),
          actorId: UserId.from(request.userId),
          teamLeaderScopeId: resolved.teamLeaderScopeId,
        });
        return reply.status(204).send(null);
      },
    );

    app.patch(
      '/assignments/:assignmentId/reassign',
      {
        schema: {
          tags: ['rostering'],
          operationId: 'reassignParticipationAssignment',
          summary: 'Reassign an Assignment to another Volunteer',
          description:
            'Replace the Volunteer on an existing Assignment, keeping its Shift and Role, and record the reason.',
          body: reassignAssignmentBodySchema,
          response: {
            200: assignmentResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as AssignmentRouteParams;
        const resolved = await this.resolveRosterAssignment({
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
          tags: ['rostering'],
          operationId: 'getParticipationCompletion',
          summary: "Get a MinistryParticipation's staffing completion",
          description:
            'Get how fully a MinistryParticipation is staffed against its SlotRequirements.',
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
          tags: ['rostering'],
          operationId: 'publishParticipation',
          summary: 'Publish a single MinistryParticipation',
          description:
            "Publish one Ministry's roster for an Event, making its slice of the schedule visible to its Volunteers.",
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

  private async resolveRosterAssignment({
    request,
    reply,
    assignmentId,
    teamId,
  }: ResolveRosterAssignmentInput): Promise<ResolveRosterAssignmentResult> {
    let assignment: Assignment;
    try {
      assignment = await this.assignmentManager.getAssignment({
        churchId: ChurchId.from(request.churchId),
        assignmentId: AssignmentId.from(assignmentId),
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        this.denyRosterAction({ reply });
        return { denied: true };
      }
      throw error;
    }
    if (!assignment.shiftId) {
      this.denyRosterAction({ reply });
      return { denied: true };
    }

    const scope = await this.resolveRosterShift({
      request,
      reply,
      shiftId: assignment.shiftId,
      teamId,
    });
    return scope.denied
      ? { denied: true }
      : {
          assignment,
          denied: false,
          teamLeaderScopeId: scope.teamLeaderScopeId,
        };
  }

  private async resolveRosterShift({
    request,
    reply,
    shiftId,
    teamId,
  }: ResolveRosterShiftInput): Promise<ResolveRosterShiftResult> {
    const churchId = ChurchId.from(request.churchId);
    const userId = UserId.from(request.userId);
    const brandedShiftId = ShiftId.from(shiftId);
    if (
      await this.authorityGuard.canManageShift({
        churchId,
        shiftId: brandedShiftId,
        userId,
      })
    ) {
      return { denied: false };
    }

    if (teamId) {
      const teamLeaderScopeId = TeamId.from(teamId);
      if (
        await this.authorityGuard.canManageTeamShift({
          churchId,
          shiftId: brandedShiftId,
          teamId: teamLeaderScopeId,
          userId,
        })
      ) {
        return { denied: false, teamLeaderScopeId };
      }
    }

    this.denyRosterAction({ reply });
    return { denied: true };
  }

  private denyRosterAction({ reply }: DenyRosterActionInput): void {
    reply.status(403).send({
      error: 'ROSTER_ACTION_NOT_AVAILABLE',
      message: 'Roster action is not available',
    });
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

  private async canReadCycleBuilder({
    churchId,
    ministryId,
    teamId,
    userId,
  }: CanReadCycleBuilderInput): Promise<boolean> {
    if (
      await this.authorityGuard.canManageMinistry({
        churchId,
        ministryId,
        userId,
      })
    ) {
      return true;
    }
    return teamId
      ? this.authorityGuard.canManageTeam({
          churchId,
          ministryId,
          teamId,
          userId,
        })
      : false;
  }
}
