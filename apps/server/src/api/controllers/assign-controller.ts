import type { AppConfig } from '@church/app-config';
import { NotFoundError } from '@church/core';
import { z } from 'zod';
import {
  AssignmentId,
  CycleId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  ShiftRequirementId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAssignmentManager } from '../../domain/contracts/application/assignment-manager';
import type { IAssignmentProposalManager } from '../../domain/contracts/application/assignment-proposal-manager';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IScheduleBuilderReader } from '../../domain/contracts/application/schedule-builder-reader';
import type { ISchedulePublisher } from '../../domain/contracts/application/schedule-publisher';
import type { IScheduleReadModel } from '../../domain/contracts/application/schedule-read-model';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import {
  assertAllowedDecision,
  assertParticipationScope,
  assertShiftScope,
} from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  applyAssignmentProposalBodySchema,
  assignMapper,
  assignmentProposalOutcomeResponseSchema,
  assignmentProposalResponseSchema,
  createParticipationAssignmentBodySchema,
  createParticipationAssignmentResponseSchema,
  eligibleVolunteerListResponseSchema,
  moveAssignmentBodySchema,
  participationCompletionResponseSchema,
  reassignAssignmentBodySchema,
} from '../dtos/assign.dto';
import {
  assignmentMapper,
  assignmentResponseSchema,
  auditListResponseSchema,
} from '../dtos/assignment.dto';
import { cycleParamsSchema } from '../dtos/cycle.dto';
import {
  cycleBuilderMapper,
  cycleBuilderResponseSchema,
  publishCycleBodySchema,
  publishCycleMapper,
  publishCycleResponseSchema,
} from '../dtos/cycle-builder.dto';
import {
  authErrorResponses,
  errorResponseSchema,
} from '../dtos/error-response.dto';
import { assignmentParamsSchema, idSchema } from '../dtos/id.dto';
import { requestCaller } from '../utils/request-caller';
import type {
  AssertAssignmentScopeInput,
  AssignControllerDependencies,
  ReviewedPairBody,
} from './assign-controller.types';

const shiftParamsSchema = z.object({ shiftId: idSchema });
const participationParamsSchema = z.object({ participationId: idSchema });

const cycleMinistryQuerySchema = z.object({ ministryId: idSchema });

const toReviewedAddition = ({
  shiftRequirementId,
  volunteerId,
}: ReviewedPairBody) => ({
  shiftRequirementId: ShiftRequirementId.from({ raw: shiftRequirementId }),
  volunteerId: VolunteerId.from(volunteerId),
});

export class AssignController implements FastifyController {
  readonly prefix = '/assign';

  private readonly scheduleBuilderReader: IScheduleBuilderReader;
  private readonly assignmentProposalManager: IAssignmentProposalManager;
  private readonly scheduleReadModel: IScheduleReadModel;
  private readonly schedulePublisher: ISchedulePublisher;
  private readonly assignmentManager: IAssignmentManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;

  private readonly parked: AppConfig['parked'];

  constructor({
    scheduleBuilderReader,
    assignmentProposalManager,
    scheduleReadModel,
    schedulePublisher,
    assignmentManager,
    activeChurchResolver,
    authorityGuard,
    config,
  }: AssignControllerDependencies) {
    this.scheduleBuilderReader = scheduleBuilderReader;
    this.assignmentProposalManager = assignmentProposalManager;
    this.scheduleReadModel = scheduleReadModel;
    this.schedulePublisher = schedulePublisher;
    this.assignmentManager = assignmentManager;
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
    const { parked } = config;
    this.parked = parked;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
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
          params: cycleParamsSchema,
          tags: ['assign'],
          operationId: 'getCycleBuilderData',
          summary: 'Get cycle builder data for a Ministry',
          description:
            "Get a Ministry's schedule-building view of a Cycle: its MinistryParticipations, Shifts, ShiftRequirements, and Assignments.",
          querystring: cycleMinistryQuerySchema,
          response: {
            200: cycleBuilderResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        const { ministryId } = request.query;

        const decision = await this.authorityGuard.decideManageMinistry({
          ...requestCaller({ request }),
          ministryId: MinistryId.from(ministryId),
        });
        await assertAllowedDecision({
          authorityGuard: this.authorityGuard,
          request,
          allowed: decision.allowed,
        });

        const view = await this.scheduleBuilderReader.getCycleBuilderData({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
          userId: request.userId,
        });
        return reply.send(cycleBuilderMapper.toResponse(view));
      },
    );

    if (this.parked.auditPanel) {
      app.get(
        '/cycles/:cycleId/audit',
        {
          schema: {
            params: cycleParamsSchema,
            tags: ['assign'],
            operationId: 'getCycleAuditLog',
            summary: "Get a Ministry's Assignment audit log for a cycle",
            description:
              "List a Ministry's Assignment audit entries across an entire Cycle.",
            querystring: cycleMinistryQuerySchema,
            response: {
              200: auditListResponseSchema,
              ...authErrorResponses,
              404: errorResponseSchema,
            },
          },
        },
        async (request, reply) => {
          const { cycleId } = request.params;
          const { ministryId } = request.query;

          const decision = await this.authorityGuard.decideManageMinistry({
            ...requestCaller({ request }),
            ministryId: MinistryId.from(ministryId),
          });
          await assertAllowedDecision({
            authorityGuard: this.authorityGuard,
            request,
            allowed: decision.allowed,
          });

          const items = await this.assignmentManager.listAuditLogForCycle({
            churchId: request.churchId,
            cycleId: CycleId.from(cycleId),
            ministryId: MinistryId.from(ministryId),
          });
          return reply.send(assignmentMapper.auditListToResponse(items));
        },
      );
    }

    app.get(
      '/cycles/:cycleId/assignment-proposal',
      {
        schema: {
          params: cycleParamsSchema,
          tags: ['assign'],
          operationId: 'getAssignmentProposal',
          summary: "Propose Assignments for a Ministry's Schedule",
          description:
            'Compute a deterministic Assignment proposal for one Schedule between asking for availability and publishing. Writes nothing.',
          querystring: cycleMinistryQuerySchema,
          response: {
            200: assignmentProposalResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        const { ministryId } = request.query;

        const decision = await this.authorityGuard.decideManageMinistry({
          ...requestCaller({ request }),
          ministryId: MinistryId.from(ministryId),
        });
        await assertAllowedDecision({
          authorityGuard: this.authorityGuard,
          request,
          allowed: decision.allowed,
        });

        const proposal =
          await this.assignmentProposalManager.getAssignmentProposal({
            churchId: request.churchId,
            cycleId: CycleId.from(cycleId),
            ministryId: MinistryId.from(ministryId),
          });
        return reply.send(assignMapper.proposalToResponse(proposal));
      },
    );

    app.post(
      '/cycles/:cycleId/assignment-proposal/apply',
      {
        schema: {
          params: cycleParamsSchema,
          tags: ['assign'],
          operationId: 'applyAssignmentProposal',
          summary: 'Apply a reviewed Assignment proposal',
          description:
            'Create the reviewed additions, less any excludedAdditions, once, atomically, as pending Assignments. A retry with the same applicationKey returns the committed outcome. Never publishes or notifies.',
          querystring: cycleMinistryQuerySchema,
          body: applyAssignmentProposalBodySchema,
          response: {
            200: assignmentProposalOutcomeResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
            409: errorResponseSchema,
            422: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        const { ministryId } = request.query;

        // Checked again on every attempt, recovery included.
        const decision = await this.authorityGuard.decideManageMinistry({
          ...requestCaller({ request }),
          ministryId: MinistryId.from(ministryId),
        });
        await assertAllowedDecision({
          authorityGuard: this.authorityGuard,
          request,
          allowed: decision.allowed,
        });

        const { applicationKey, reviewToken, additions, excludedAdditions } =
          request.body;
        const outcome =
          await this.assignmentProposalManager.applyAssignmentProposal({
            churchId: request.churchId,
            cycleId: CycleId.from(cycleId),
            ministryId: MinistryId.from(ministryId),
            actorId: request.userId,
            applicationKey,
            reviewToken,
            additions: additions.map(toReviewedAddition),
            excludedAdditions: excludedAdditions.map(toReviewedAddition),
          });
        return reply.send(assignMapper.proposalOutcomeToResponse(outcome));
      },
    );

    app.post(
      '/cycles/:cycleId/publish',
      {
        schema: {
          params: cycleParamsSchema,
          tags: ['assign'],
          operationId: 'publishCycle',
          summary: "Publish a Ministry's schedule for a cycle",
          description:
            'Publish every eligible MinistryParticipation in a Cycle for a Ministry in one batch, making its schedules visible to Volunteers.',
          querystring: cycleMinistryQuerySchema,
          body: publishCycleBodySchema,
          response: {
            200: publishCycleResponseSchema,
            409: errorResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        const { ministryId } = request.query;

        const decision = await this.authorityGuard.decideManageMinistry({
          ...requestCaller({ request }),
          ministryId: MinistryId.from(ministryId),
        });
        await assertAllowedDecision({
          authorityGuard: this.authorityGuard,
          request,
          allowed: decision.allowed,
        });

        const body = request.body;
        const view = await this.schedulePublisher.publishCycle({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
          userId: request.userId,
          confirmBelowFull: body.confirmBelowFull,
        });
        return reply.send(publishCycleMapper.toResponse(view));
      },
    );

    app.post(
      '/cycles/:cycleId/send-updates',
      {
        schema: {
          params: cycleParamsSchema,
          tags: ['assign'],
          operationId: 'sendScheduleUpdates',
          summary: 'Send Schedule updates',
          querystring: cycleMinistryQuerySchema,
          response: {
            200: z.object({ notifiedCount: z.number() }),
            ...authErrorResponses,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        const { ministryId } = request.query;
        const decision = await this.authorityGuard.decideManageMinistry({
          ...requestCaller({ request }),
          ministryId: MinistryId.from(ministryId),
        });
        await assertAllowedDecision({
          authorityGuard: this.authorityGuard,
          request,
          allowed: decision.allowed,
        });
        const result = await this.schedulePublisher.sendScheduleUpdates({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
          userId: request.userId,
        });
        return reply.send(result);
      },
    );

    app.get(
      '/shifts/:shiftId/eligible-volunteers',
      {
        schema: {
          params: shiftParamsSchema,
          tags: ['assign'],
          operationId: 'listEligibleVolunteers',
          summary: 'List eligible Volunteers for a Shift',
          description:
            'List the Volunteers eligible to be assigned to a Shift, for the schedule builder.',
          response: {
            200: eligibleVolunteerListResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { shiftId } = request.params;
        await assertShiftScope({
          authorityGuard: this.authorityGuard,
          request,
          shiftId,
        });

        const volunteers =
          await this.scheduleBuilderReader.listEligibleVolunteers({
            churchId: request.churchId,
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
          params: shiftParamsSchema,
          tags: ['assign'],
          operationId: 'createParticipationAssignment',
          summary: 'Assign a Volunteer to a ShiftRequirement',
          description:
            'Assign a Volunteer to a specific Sector and Role need within a Shift.',
          body: createParticipationAssignmentBodySchema,
          response: {
            201: createParticipationAssignmentResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { shiftId } = request.params;
        const body = request.body;
        await assertShiftScope({
          authorityGuard: this.authorityGuard,
          request,
          shiftId,
        });

        const input = {
          churchId: request.churchId,
          shiftId: ShiftId.from(shiftId),
          volunteerId: VolunteerId.from(body.volunteerId),
          actorId: request.userId,
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
          params: assignmentParamsSchema,
          tags: ['assign'],
          operationId: 'deleteParticipationAssignment',
          summary: 'Delete an Assignment',
          description: 'Remove a Volunteer Assignment from its Shift.',
          response: {
            204: z.null(),
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params;
        await this.assertAssignmentScope({ request, assignmentId });

        await this.assignmentManager.deleteAssignment({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: request.churchId,
          actorId: request.userId,
        });
        return reply.status(204).send(null);
      },
    );

    app.patch(
      '/assignments/:assignmentId/move',
      {
        schema: {
          params: assignmentParamsSchema,
          tags: ['assign'],
          operationId: 'moveParticipationAssignment',
          summary: 'Move an Assignment to another Sector',
          body: moveAssignmentBodySchema,
          response: {
            200: assignmentResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params;
        await this.assertAssignmentScope({ request, assignmentId });
        const body = request.body;
        const moved = await this.assignmentManager.moveParticipationAssignment({
          churchId: request.churchId,
          assignmentId: AssignmentId.from(assignmentId),
          shiftRequirementId: ShiftRequirementId.from({
            raw: body.shiftRequirementId,
          }),
          actorId: request.userId,
        });
        return reply.send(assignmentMapper.toResponse(moved));
      },
    );

    app.patch(
      '/assignments/:assignmentId/reassign',
      {
        schema: {
          params: assignmentParamsSchema,
          tags: ['assign'],
          operationId: 'reassignParticipationAssignment',
          summary: 'Reassign an Assignment to another Volunteer',
          description:
            'Replace the Volunteer on an existing Assignment, keeping its Shift and Role.',
          body: reassignAssignmentBodySchema,
          response: {
            200: assignmentResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params;
        await this.assertAssignmentScope({ request, assignmentId });

        const body = request.body;
        const reassigned =
          await this.assignmentManager.reassignParticipationAssignment({
            churchId: request.churchId,
            assignmentId: AssignmentId.from(assignmentId),
            volunteerId: VolunteerId.from(body.volunteerId),
            actorId: request.userId,
          });
        return reply.send(assignmentMapper.toResponse(reassigned));
      },
    );

    app.get(
      '/participations/:participationId/completion',
      {
        schema: {
          params: participationParamsSchema,
          tags: ['assign'],
          operationId: 'getParticipationCompletion',
          summary: "Get a MinistryParticipation's staffing completion",
          description:
            'Get how fully a MinistryParticipation is staffed against its ShiftRequirements.',
          response: {
            200: participationCompletionResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { participationId } = request.params;
        await assertParticipationScope({
          authorityGuard: this.authorityGuard,
          request,
          participationId,
        });

        const completion = await this.scheduleReadModel.getCompletion({
          churchId: request.churchId,
          participationId: MinistryParticipationId.from(participationId),
        });
        return reply.send(assignMapper.completionToResponse(completion));
      },
    );
  }

  /**
   * `assertShiftScope` for the Assignment's Shift. A missing Assignment, or one
   * with no Shift, is refused as a denied object decision.
   */
  private async assertAssignmentScope({
    request,
    assignmentId,
  }: AssertAssignmentScopeInput): Promise<void> {
    const access = { authorityGuard: this.authorityGuard, request };
    let shiftId: ShiftId | undefined;
    try {
      const assignment = await this.assignmentManager.getAssignment({
        churchId: request.churchId,
        assignmentId: AssignmentId.from(assignmentId),
      });
      shiftId = assignment.shiftId;
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
    if (!shiftId) return assertAllowedDecision({ ...access, allowed: false });
    await assertShiftScope({ ...access, shiftId });
  }
}
