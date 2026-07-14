import 'reflect-metadata';
import { auth } from '@church/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  PlanningCycleId,
  RoleId,
  ShiftId,
  TeamId,
  TimeSlotId,
  UserId,
} from '../../domain/branded-ids';
import type { IAvailabilityCheckManager } from '../../domain/contracts/application/availability-check-manager';
import type { IParticipationManager } from '../../domain/contracts/application/participation-manager';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { ShiftSplitStrategy } from '../../domain/services/shift-splitter';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { SchedulingRbacGuard } from '../auth/scheduling-rbac-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  availabilityStatusResponseSchema,
  cycleParticipationResponseSchema,
  fireAvailabilityResponseSchema,
  ministryCycleSummaryListResponseSchema,
  participationMapper,
  setInclusionsBodySchema,
  shiftListResponseSchema,
  shiftRequirementBodySchema,
  shiftRequirementResponseSchema,
  shiftResponseSchema,
  splitShiftsBodySchema,
  updateShiftBodySchema,
} from '../dtos/participation.dto';
import { headersFromRequest } from '../utils/headers';

interface CycleParticipationRouteParams {
  cycleId: string;
}

interface MinistryCycleSummaryRouteParams {
  ministryId: string;
}

interface CycleMinistryQuery {
  ministryId: string;
}

interface ParticipationRouteParams {
  participationId: string;
}

interface ParticipationSlotRouteParams {
  participationId: string;
  timeSlotId: string;
}

interface ShiftRouteParams {
  shiftId: string;
}

type SplitShiftsBody = z.infer<typeof splitShiftsBodySchema>;
type SetInclusionsBody = z.infer<typeof setInclusionsBodySchema>;
type UpdateShiftBody = z.infer<typeof updateShiftBodySchema>;
type ShiftRequirementBody = z.infer<typeof shiftRequirementBodySchema>;

const cycleParticipationQuerySchema = z.object({
  ministryId: z.string(),
});

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

@injectable()
export class LeaderController implements FastifyController {
  readonly prefix = '/leader';

  constructor(
    @inject('IParticipationManager')
    private readonly participationManager: IParticipationManager,
    @inject('IAvailabilityCheckManager')
    private readonly availabilityCheckManager: IAvailabilityCheckManager,
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
      '/cycles/:cycleId/participation',
      {
        schema: {
          tags: ['admin'],
          operationId: 'getCycleParticipation',
          querystring: cycleParticipationQuerySchema,
          response: {
            200: cycleParticipationResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleParticipationRouteParams;
        const { ministryId } = request.query as CycleMinistryQuery;

        const allowed = await this.rbacGuard.canManageMinistry({
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

        const view = await this.participationManager.getCycleParticipation({
          churchId: ChurchId.from(request.churchId),
          cycleId: PlanningCycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
        });
        return reply.send(participationMapper.cycleViewToResponse(view));
      },
    );

    app.get(
      '/ministries/:ministryId/cycles-summary',
      {
        schema: {
          tags: ['admin'],
          operationId: 'listMinistryCycleSummaries',
          response: {
            200: ministryCycleSummaryListResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ministryId } =
          request.params as MinistryCycleSummaryRouteParams;

        const allowed = await this.rbacGuard.canManageMinistry({
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

        const views =
          await this.participationManager.listMinistryCycleSummaries({
            churchId: ChurchId.from(request.churchId),
            ministryId: MinistryId.from(ministryId),
          });
        return reply.send(
          participationMapper.ministryCycleSummaryListToResponse(views),
        );
      },
    );

    app.put(
      '/participations/:participationId/inclusions',
      {
        schema: {
          tags: ['admin'],
          operationId: 'setParticipationInclusions',
          body: setInclusionsBodySchema,
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

        const body = request.body as SetInclusionsBody;
        await this.participationManager.setInclusions({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
          timeSlotIds: body.timeSlotIds.map(TimeSlotId.from),
        });
        return reply.status(204).send();
      },
    );

    app.post(
      '/participations/:participationId/slots/:timeSlotId/shifts',
      {
        schema: {
          tags: ['admin'],
          operationId: 'splitParticipationShifts',
          body: splitShiftsBodySchema,
          response: { 201: shiftListResponseSchema },
        },
      },
      async (request, reply) => {
        const { participationId, timeSlotId } =
          request.params as ParticipationSlotRouteParams;
        const denied = await this.denyParticipationScope(
          request,
          reply,
          participationId,
        );
        if (denied) return denied;

        const body = request.body as SplitShiftsBody;
        const shifts = await this.participationManager.splitShifts({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
          timeSlotId: TimeSlotId.from(timeSlotId),
          strategy: toSplitStrategy({ body }),
        });
        return reply
          .status(201)
          .send(participationMapper.shiftListToResponse(shifts));
      },
    );

    app.patch(
      '/shifts/:shiftId',
      {
        schema: {
          tags: ['admin'],
          operationId: 'updateShift',
          body: updateShiftBodySchema,
          response: { 200: shiftResponseSchema },
        },
      },
      async (request, reply) => {
        const { shiftId } = request.params as ShiftRouteParams;
        const denied = await this.denyShiftScope(request, reply, shiftId);
        if (denied) return denied;

        const body = request.body as UpdateShiftBody;
        const shift = await this.participationManager.updateShift({
          churchId: ChurchId.from(request.churchId),
          shiftId: ShiftId.from(shiftId),
          startTime: body.startTime ? new Date(body.startTime) : undefined,
          endTime: body.endTime ? new Date(body.endTime) : undefined,
          label: body.label,
        });
        return reply.send(participationMapper.shiftToResponse(shift));
      },
    );

    app.delete(
      '/shifts/:shiftId',
      { schema: { tags: ['admin'], operationId: 'deleteShift' } },
      async (request, reply) => {
        const { shiftId } = request.params as ShiftRouteParams;
        const denied = await this.denyShiftScope(request, reply, shiftId);
        if (denied) return denied;

        await this.participationManager.deleteShift({
          churchId: ChurchId.from(request.churchId),
          shiftId: ShiftId.from(shiftId),
        });
        return reply.status(204).send();
      },
    );

    app.put(
      '/shifts/:shiftId/requirements',
      {
        schema: {
          tags: ['admin'],
          operationId: 'upsertShiftRequirement',
          body: shiftRequirementBodySchema,
          response: { 200: shiftRequirementResponseSchema },
        },
      },
      async (request, reply) => {
        const { shiftId } = request.params as ShiftRouteParams;
        const denied = await this.denyShiftScope(request, reply, shiftId);
        if (denied) return denied;

        const body = request.body as ShiftRequirementBody;
        const requirement = await this.participationManager.upsertRequirement({
          churchId: ChurchId.from(request.churchId),
          shiftId: ShiftId.from(shiftId),
          roleId: RoleId.from(body.roleId),
          teamId: body.teamId ? TeamId.from(body.teamId) : undefined,
          requiredCount: body.requiredCount,
          notes: body.notes,
        });
        return reply.send(
          participationMapper.requirementToResponse(requirement),
        );
      },
    );

    app.post(
      '/participations/:participationId/fire-availability',
      {
        schema: {
          tags: ['admin'],
          operationId: 'fireAvailability',
          response: { 202: fireAvailabilityResponseSchema },
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

        const result = await this.availabilityCheckManager.fireAvailability({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
        });
        return reply.status(202).send(result);
      },
    );

    app.get(
      '/cycles/:cycleId/availability-status',
      {
        schema: {
          tags: ['admin'],
          operationId: 'getCycleAvailabilityStatus',
          querystring: cycleParticipationQuerySchema,
          response: {
            200: availabilityStatusResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleParticipationRouteParams;
        const { ministryId } = request.query as CycleMinistryQuery;

        const allowed = await this.rbacGuard.canManageMinistry({
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

        const statuses =
          await this.availabilityCheckManager.listCycleCheckStatuses({
            churchId: ChurchId.from(request.churchId),
            cycleId: PlanningCycleId.from(cycleId),
            ministryId: MinistryId.from(ministryId),
          });
        return reply.send({
          statuses: statuses.map((status) => ({
            volunteerId: status.volunteerId,
            volunteerName: status.volunteerName,
            state: status.state,
            confirmedAt: status.confirmedAt?.toISOString(),
          })),
        });
      },
    );

    app.get(
      '/participations/:participationId/availability-status',
      {
        schema: {
          tags: ['admin'],
          operationId: 'getAvailabilityStatus',
          response: { 200: availabilityStatusResponseSchema },
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

        const statuses = await this.availabilityCheckManager.listCheckStatuses({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
        });
        return reply.send({
          statuses: statuses.map((status) => ({
            volunteerId: status.volunteerId,
            volunteerName: status.volunteerName,
            state: status.state,
            confirmedAt: status.confirmedAt?.toISOString(),
          })),
        });
      },
    );

    app.post(
      '/participations/:participationId/resend-availability',
      {
        schema: {
          tags: ['admin'],
          operationId: 'resendAvailabilityReminder',
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

        await this.availabilityCheckManager.resendReminder({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
        });
        return reply.status(202).send({ resent: true });
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

    if (!allowed) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Participation belongs to another ministry',
      });
    }

    return null;
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

    if (!allowed) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Shift belongs to another ministry',
      });
    }

    return null;
  }
}

interface ToSplitStrategyInput {
  body: SplitShiftsBody;
}

function toSplitStrategy({ body }: ToSplitStrategyInput): ShiftSplitStrategy {
  if (body.strategy.kind === 'equal-n') {
    return { kind: 'equal-n', n: body.strategy.n };
  }

  return {
    kind: 'manual',
    spans: body.strategy.spans.map((span) => ({
      startTime: new Date(span.startTime),
      endTime: new Date(span.endTime),
      label: span.label,
    })),
  };
}
