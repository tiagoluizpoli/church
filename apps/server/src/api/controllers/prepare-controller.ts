import { parseInstant } from '@church/time';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ChurchId,
  CycleId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TeamId,
  UserId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAvailabilityCheckManager } from '../../domain/contracts/application/availability-check-manager';
import type { IParticipationManager } from '../../domain/contracts/application/participation-manager';
import type { ShiftSplitStrategy } from '../../domain/services/shift-splitter';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  askAvailabilityResponseSchema,
  availabilityStatusResponseSchema,
  cycleParticipationResponseSchema,
  participationMapper,
  scheduleSummaryListResponseSchema,
  setInclusionsBodySchema,
  shiftListResponseSchema,
  shiftRequirementBodySchema,
  shiftRequirementResponseSchema,
  shiftResponseSchema,
  splitShiftsBodySchema,
  updateShiftBodySchema,
} from '../dtos/participation.dto';
import { optionalDateFromInstantString } from '../utils/request-time';

interface CycleParticipationRouteParams {
  cycleId: string;
}

interface ScheduleSummaryRouteParams {
  ministryId: string;
}

interface CycleMinistryQuery {
  ministryId: string;
}

interface ParticipationRouteParams {
  participationId: string;
}

interface ParticipationEventTimeBlockRouteParams {
  participationId: string;
  eventTimeBlockId: string;
}

interface ShiftRouteParams {
  shiftId: string;
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

interface PrepareControllerDependencies {
  participationManager: IParticipationManager;
  availabilityCheckManager: IAvailabilityCheckManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
}

export class PrepareController implements FastifyController {
  readonly prefix = '/prepare';

  private readonly participationManager: IParticipationManager;
  private readonly availabilityCheckManager: IAvailabilityCheckManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;

  constructor({
    participationManager,
    availabilityCheckManager,
    activeChurchResolver,
    authorityGuard,
  }: PrepareControllerDependencies) {
    this.participationManager = participationManager;
    this.availabilityCheckManager = availabilityCheckManager;
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
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
      '/cycles/:cycleId/participation',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'getCycleParticipation',
          summary: "Get a Ministry's prepare view of a cycle",
          description:
            "Get a Ministry's MinistryParticipation prepare state across every Event in a Cycle.",
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

        const view = await this.participationManager.getCycleParticipation({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
        });
        return reply.send(participationMapper.cycleViewToResponse(view));
      },
    );

    app.get(
      '/ministries/:ministryId/cycles-summary',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'listScheduleSummaries',
          summary: "List a Ministry's cycle prepare summaries",
          description:
            "List summaries of a Ministry's MinistryParticipation prepare progress across its Cycles.",
          response: {
            200: scheduleSummaryListResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params as ScheduleSummaryRouteParams;

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

        const views = await this.participationManager.listScheduleSummaries({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
        });
        return reply.send(
          participationMapper.scheduleSummaryListToResponse(views),
        );
      },
    );

    app.put(
      '/participations/:participationId/inclusions',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'setParticipationInclusions',
          summary: "Set a MinistryParticipation's included EventTimeBlocks",
          description:
            'Replace the set of EventTimeBlocks a Ministry is opted into for a MinistryParticipation.',
          body: setInclusionsBodySchema,
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

        const body = request.body as SetInclusionsBody;
        await this.participationManager.setInclusions({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
          eventTimeBlockIds: body.eventTimeBlockIds.map(EventTimeBlockId.from),
        });
        return reply.status(204).send();
      },
    );

    app.post(
      '/participations/:participationId/event-time-blocks/:eventTimeBlockId/shifts',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'splitParticipationShifts',
          summary: 'Split a EventTimeBlock into Shifts',
          description:
            "Split a MinistryParticipation's EventTimeBlock into Shifts, either into equal parts or by manually-set spans.",
          body: splitShiftsBodySchema,
          response: { 201: shiftListResponseSchema },
        },
      },
      async (request, reply) => {
        const { participationId, eventTimeBlockId } =
          request.params as ParticipationEventTimeBlockRouteParams;
        const denied = await this.denyParticipationScope({
          request,
          reply,
          participationId,
        });
        if (denied) return;

        const body = request.body as SplitShiftsBody;
        const shifts = await this.participationManager.splitShifts({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
          eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockId),
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
          tags: ['prepare'],
          operationId: 'updateShift',
          summary: 'Update a Shift',
          description: "Update a Shift's bounds or label.",
          body: updateShiftBodySchema,
          response: { 200: shiftResponseSchema },
        },
      },
      async (request, reply) => {
        const { shiftId } = request.params as ShiftRouteParams;
        const denied = await this.denyShiftScope({ request, reply, shiftId });
        if (denied) return;

        const body = request.body as UpdateShiftBody;
        const shift = await this.participationManager.updateShift({
          churchId: ChurchId.from(request.churchId),
          shiftId: ShiftId.from(shiftId),
          startTime: optionalDateFromInstantString({ value: body.startTime }),
          endTime: optionalDateFromInstantString({ value: body.endTime }),
          label: body.label,
        });
        return reply.send(participationMapper.shiftToResponse(shift));
      },
    );

    app.delete(
      '/shifts/:shiftId',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'deleteShift',
          summary: 'Delete a Shift',
          description: 'Delete a Shift from its MinistryParticipation.',
        },
      },
      async (request, reply) => {
        const { shiftId } = request.params as ShiftRouteParams;
        const denied = await this.denyShiftScope({ request, reply, shiftId });
        if (denied) return;

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
          tags: ['prepare'],
          operationId: 'upsertShiftRequirement',
          summary: 'Set a Shift staffing requirement',
          description:
            'Set the ShiftRequirement headcount for a Role (and optional Team) within a Shift.',
          body: shiftRequirementBodySchema,
          response: { 200: shiftRequirementResponseSchema },
        },
      },
      async (request, reply) => {
        const { shiftId } = request.params as ShiftRouteParams;
        const denied = await this.denyShiftScope({ request, reply, shiftId });
        if (denied) return;

        const body = request.body as ShiftRequirementBody;
        const requirement = await this.participationManager.upsertRequirement({
          churchId: ChurchId.from(request.churchId),
          shiftId: ShiftId.from(shiftId),
          roleId: RoleId.from(body.roleId),
          teamId: body.teamId ? TeamId.from(body.teamId) : undefined,
          peopleNeeded: body.peopleNeeded,
          notes: body.notes,
        });
        return reply.send(
          participationMapper.requirementToResponse(requirement),
        );
      },
    );

    app.post(
      '/participations/:participationId/ask-availability',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'askAvailability',
          summary: 'Ask availability for a MinistryParticipation',
          description:
            "Spawn AvailabilityChecks for a MinistryParticipation's Volunteers and move it into availability_requested.",
          response: { 202: askAvailabilityResponseSchema },
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

        const result = await this.availabilityCheckManager.askAvailability({
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
          tags: ['prepare'],
          operationId: 'getCycleAvailabilityStatus',
          summary: "Get a Ministry's AvailabilityCheck status for a cycle",
          description:
            "List a Ministry's Volunteers' AvailabilityCheck states across a Cycle.",
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

        const statuses =
          await this.availabilityCheckManager.listCycleCheckStatuses({
            churchId: ChurchId.from(request.churchId),
            cycleId: CycleId.from(cycleId),
            ministryId: MinistryId.from(ministryId),
          });
        return reply.send({
          statuses: statuses.map((status) => ({
            volunteerId: status.volunteerId,
            volunteerName: status.volunteerName,
            state: status.state,
            confirmedAt: status.confirmedAt,
          })),
        });
      },
    );

    app.get(
      '/participations/:participationId/availability-status',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'getAvailabilityStatus',
          summary: "Get a MinistryParticipation's AvailabilityCheck status",
          description:
            "List the AvailabilityCheck states of a MinistryParticipation's Volunteers.",
          response: { 200: availabilityStatusResponseSchema },
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

        const statuses = await this.availabilityCheckManager.listCheckStatuses({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
        });
        return reply.send({
          statuses: statuses.map((status) => ({
            volunteerId: status.volunteerId,
            volunteerName: status.volunteerName,
            state: status.state,
            confirmedAt: status.confirmedAt,
          })),
        });
      },
    );

    app.post(
      '/participations/:participationId/resend-availability',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'resendAvailabilityReminder',
          summary: 'Resend an availability reminder',
          description:
            "Resend the availability reminder VolunteerNotification to a MinistryParticipation's unconfirmed Volunteers.",
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

        await this.availabilityCheckManager.resendReminder({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
        });
        return reply.status(202).send({ resent: true });
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

    if (!allowed) {
      reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Participation belongs to another ministry',
      });
      return true;
    }

    return false;
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

    if (!allowed) {
      reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Shift belongs to another ministry',
      });
      return true;
    }

    return false;
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
      startTime: parseInstant({ value: span.startTime }),
      endTime: parseInstant({ value: span.endTime }),
      label: span.label,
    })),
  };
}
