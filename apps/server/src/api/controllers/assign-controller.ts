import type { AppConfig } from '@church/app-config';
import { NotFoundError } from '@church/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AssignmentId,
  ChurchId,
  CycleId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  ShiftRequirementId,
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
  assignMapper,
  createParticipationAssignmentBodySchema,
  createParticipationAssignmentResponseSchema,
  eligibleVolunteerListResponseSchema,
  participationCompletionResponseSchema,
  reassignAssignmentBodySchema,
} from '../dtos/assign.dto';
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

interface ResolveScheduleShiftInput {
  request: FastifyRequest;
  reply: FastifyReply;
  shiftId: string;
}

interface DenyAssignActionInput {
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
  userId: UserId;
}

interface AssignControllerDependencies {
  participationManager: IParticipationManager;
  assignmentManager: IAssignmentManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
  config: AppConfig;
}

export class AssignController implements FastifyController {
  readonly prefix = '/assign';

  private readonly participationManager: IParticipationManager;
  private readonly assignmentManager: IAssignmentManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;

  private readonly parked: AppConfig['parked'];

  constructor({
    participationManager,
    assignmentManager,
    activeChurchResolver,
    authorityGuard,
    config,
  }: AssignControllerDependencies) {
    this.participationManager = participationManager;
    this.assignmentManager = assignmentManager;
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
    const { parked } = config;
    this.parked = parked;
  }

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({ resolver: this.activeChurchResolver }),
    );

    app.get(
      '/cycles/:cycleId/builder',
      {
        schema: {
          tags: ['assign'],
          operationId: 'getCycleBuilderData',
          summary: 'Get cycle builder data for a Ministry',
          description:
            "Get a Ministry's schedule-building view of a Cycle: its MinistryParticipations, Shifts, ShiftRequirements, and Assignments.",
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

        const allowed = await this.canReadCycleBuilder({
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
          cycleId: CycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        return reply.send(cycleBuilderMapper.toResponse(view));
      },
    );

    if (this.parked.auditPanel) {
      app.get(
        '/cycles/:cycleId/audit',
        {
          schema: {
            tags: ['assign'],
            operationId: 'getCycleAuditLog',
            summary: "Get a Ministry's Assignment audit log for a cycle",
            description:
              "List a Ministry's Assignment audit entries across an entire Cycle.",
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
            cycleId: CycleId.from(cycleId),
            ministryId: MinistryId.from(ministryId),
          });
          return reply.send(assignmentMapper.auditListToResponse(items));
        },
      );
    }

    app.post(
      '/cycles/:cycleId/publish',
      {
        schema: {
          tags: ['assign'],
          operationId: 'publishCycle',
          summary: "Publish a Ministry's schedule for a cycle",
          description:
            'Publish every eligible MinistryParticipation in a Cycle for a Ministry in one batch, making its schedules visible to Volunteers.',
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
          cycleId: CycleId.from(cycleId),
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
          tags: ['assign'],
          operationId: 'listEligibleVolunteers',
          summary: 'List eligible Volunteers for a Shift',
          description:
            'List the Volunteers eligible to be assigned to a Shift, for the schedule builder.',
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
          assignMapper.eligibleVolunteerListToResponse(volunteers),
        );
      },
    );

    app.post(
      '/shifts/:shiftId/assignments',
      {
        schema: {
          tags: ['assign'],
          operationId: 'createParticipationAssignment',
          summary: 'Assign a Volunteer to a ShiftRequirement',
          description:
            'Assign a Volunteer to a specific Sector and Role need within a Shift.',
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
        const scope = await this.resolveScheduleShift({
          request,
          reply,
          shiftId,
        });
        if (scope.denied) return;

        const input = {
          churchId: ChurchId.from(request.churchId),
          shiftId: ShiftId.from(shiftId),
          volunteerId: VolunteerId.from(body.volunteerId),
          actorId: UserId.from(request.userId),
          shiftRequirementId: ShiftRequirementId.from({
            raw: body.shiftRequirementId,
          }),
        };
        const result =
          await this.assignmentManager.createParticipationAssignment(input);
        return reply
          .status(201)
          .send(assignMapper.assignmentResultToResponse(result));
      },
    );

    app.delete(
      '/assignments/:assignmentId',
      {
        schema: {
          tags: ['assign'],
          operationId: 'deleteParticipationAssignment',
          summary: 'Delete an Assignment',
          description: 'Remove a Volunteer Assignment from its Shift.',
          response: { 204: z.null(), 403: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as AssignmentRouteParams;
        const resolved = await this.resolveScheduleAssignment({
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
          tags: ['assign'],
          operationId: 'reassignParticipationAssignment',
          summary: 'Reassign an Assignment to another Volunteer',
          description:
            'Replace the Volunteer on an existing Assignment, keeping its Shift and Role.',
          body: reassignAssignmentBodySchema,
          response: {
            200: assignmentResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as AssignmentRouteParams;
        const resolved = await this.resolveScheduleAssignment({
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
          });
        return reply.send(assignmentMapper.toResponse(reassigned));
      },
    );

    app.get(
      '/participations/:participationId/completion',
      {
        schema: {
          tags: ['assign'],
          operationId: 'getParticipationCompletion',
          summary: "Get a MinistryParticipation's staffing completion",
          description:
            'Get how fully a MinistryParticipation is staffed against its ShiftRequirements.',
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
        return reply.send(assignMapper.completionToResponse(completion));
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

  private async resolveScheduleAssignment({
    request,
    reply,
    assignmentId,
  }: ResolveOwnedAssignmentInput): Promise<ResolveOwnedAssignmentResult> {
    let assignment: Assignment;
    try {
      assignment = await this.assignmentManager.getAssignment({
        churchId: ChurchId.from(request.churchId),
        assignmentId: AssignmentId.from(assignmentId),
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        this.denyAssignAction({ reply });
        return { denied: true };
      }
      throw error;
    }
    if (!assignment.shiftId) {
      this.denyAssignAction({ reply });
      return { denied: true };
    }

    const scope = await this.resolveScheduleShift({
      request,
      reply,
      shiftId: assignment.shiftId,
    });
    return scope.denied ? { denied: true } : { assignment, denied: false };
  }

  private async resolveScheduleShift({
    request,
    reply,
    shiftId,
  }: ResolveScheduleShiftInput): Promise<ResolveOwnedAssignmentResult> {
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

    this.denyAssignAction({ reply });
    return { denied: true };
  }

  private denyAssignAction({ reply }: DenyAssignActionInput): void {
    reply.status(403).send({
      error: 'ASSIGN_ACTION_NOT_AVAILABLE',
      message: 'Schedule action is not available',
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
    userId,
  }: CanReadCycleBuilderInput): Promise<boolean> {
    return this.authorityGuard.canManageMinistry({
      churchId,
      ministryId,
      userId,
    });
  }
}
