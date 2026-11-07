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
  SectorId,
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
  askBlockedFlaggedShiftsResponseSchema,
  askPreviewResponseSchema,
  askScheduleBodySchema,
  askScheduleResponseSchema,
  availabilityDeadlineResponseSchema,
  availabilityStatusResponseSchema,
  cycleParticipationResponseSchema,
  headcountBelowAssignedResponseSchema,
  participationEventTimeBlockViewSchema,
  participationMapper,
  preparationValidationErrorResponseSchema,
  type SavePreparationBody,
  savePreparationBodySchema,
  scheduleListResponseSchema,
  scheduleSummaryListResponseSchema,
  setAvailabilityDeadlineBodySchema,
  shiftHasResponsesResponseSchema,
} from '../dtos/participation.dto';
import { refuse } from '../utils/refuse';

interface CycleParticipationRouteParams {
  cycleId: string;
}

interface ScheduleSummaryRouteParams {
  ministryId: string;
}

interface CycleMinistryQuery {
  ministryId: string;
}

type AskScheduleBody = z.infer<typeof askScheduleBodySchema>;
type SetAvailabilityDeadlineBody = z.infer<
  typeof setAvailabilityDeadlineBodySchema
>;

interface ParticipationRouteParams {
  participationId: string;
}

interface ParticipationEventTimeBlockRouteParams {
  participationId: string;
  eventTimeBlockId: string;
}

interface DenyParticipationScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  participationId: string;
}

interface DenyAuthorityDecisionInput {
  request: FastifyRequest;
  reply: FastifyReply;
  allowed: boolean;
}

const cycleParticipationQuerySchema = z.object({
  ministryId: z.string(),
});

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

const resendAvailabilityResponseSchema = z.object({
  resent: z.boolean(),
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
      '/schedules',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'listSchedules',
          summary: "List the caller's Schedules",
          description:
            'List one row per Ministry and Sent or Past Cycle with its derived stage: every active Ministry for a ChurchAdmin, the led ones for a leader.',
          response: {
            200: scheduleListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const churchId = ChurchId.from(request.churchId);
        const { isChurchAdmin, ledMinistries } =
          await this.authorityGuard.resolveCallerCapabilities({
            churchId,
            userId: UserId.from(request.userId),
          });
        if (!isChurchAdmin && ledMinistries.length === 0) {
          refuse({ reply, request, code: 'FORBIDDEN' });
          return;
        }

        const schedules = await this.participationManager.listSchedules({
          churchId,
          ministryIds: isChurchAdmin
            ? undefined
            : ledMinistries.map(({ ministryId }) => ministryId),
        });
        return reply.send(
          participationMapper.scheduleListToResponse(schedules),
        );
      },
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
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleParticipationRouteParams;
        const { ministryId } = request.query as CycleMinistryQuery;

        const decision = await this.authorityGuard.decideManageMinistry({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        if (
          await this.denyAuthorityDecision({
            request,
            reply,
            allowed: decision.allowed,
          })
        )
          return;

        const view = await this.participationManager.getCycleParticipation({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
        });
        return reply.send(participationMapper.cycleViewToResponse(view));
      },
    );

    app.get(
      '/cycles/:cycleId/ask-preview',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'getAskPreview',
          summary: 'Preview what an Ask for availability would cover',
          description:
            'Read the eligible Volunteer count, served Shift and Event counts, flagged blocks and needed Roles nobody holds for one Ministry in one Cycle. Writes nothing; a Ministry serving nothing answers zeroes.',
          querystring: cycleParticipationQuerySchema,
          response: {
            200: askPreviewResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleParticipationRouteParams;
        const { ministryId } = request.query as CycleMinistryQuery;

        const decision = await this.authorityGuard.decideManageMinistry({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        if (
          await this.denyAuthorityDecision({
            request,
            reply,
            allowed: decision.allowed,
          })
        )
          return;

        const preview = await this.availabilityCheckManager.getAskPreview({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
        });
        return reply.send(preview);
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
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params as ScheduleSummaryRouteParams;

        const decision = await this.authorityGuard.decideManageMinistry({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        if (
          await this.denyAuthorityDecision({
            request,
            reply,
            allowed: decision.allowed,
          })
        )
          return;

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
      '/participations/:participationId/event-time-blocks/:eventTimeBlockId/preparation',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'saveEventTimeBlockPreparation',
          summary: "Save one EventTimeBlock's preparation",
          description:
            'Apply the complete desired Serves, Shift split and headcounts of one EventTimeBlock in one transaction. Omitted or zero headcounts remove their ShiftRequirement; other blocks are untouched. Serving with neither split nor headcounts opts a block with no Shifts in from the Usual setup. A headcount cannot drop below its active Assignments. Re-splitting, deleting a Shift or opting out is refused while an affected Shift carries UnavailableShift marks or active Assignments.',
          body: savePreparationBodySchema,
          response: {
            200: participationEventTimeBlockViewSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: z.union([
              headcountBelowAssignedResponseSchema,
              shiftHasResponsesResponseSchema,
              errorResponseSchema,
            ]),
            422: preparationValidationErrorResponseSchema,
          },
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

        const { serves, shiftSplit, headcounts } =
          request.body as SavePreparationBody;
        const view = await this.participationManager.savePreparation({
          churchId: ChurchId.from(request.churchId),
          participationId: MinistryParticipationId.from(participationId),
          eventTimeBlockId: EventTimeBlockId.from(eventTimeBlockId),
          serves,
          shiftSplit: shiftSplit && toPreparationSplit({ shiftSplit }),
          headcounts: headcounts?.map((headcount) => ({
            ...headcount,
            sectorId: SectorId.from(headcount.sectorId),
            roleId: RoleId.from(headcount.roleId),
          })),
        });
        return reply.send(
          participationMapper.eventTimeBlockViewToResponse(view),
        );
      },
    );

    app.post(
      '/cycles/:cycleId/ask-availability',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'askScheduleAvailability',
          summary: 'Ask availability for a Schedule',
          description:
            "Move every MinistryParticipation of a Ministry's Schedule to availability_requested, write the ask record, spawn one AvailabilityCheck per Volunteer holding a needed Role and notify each, in one transaction. Refused while a served Shift is flagged, with zero eligible Volunteers, and on a repeat Ask.",
          body: askScheduleBodySchema,
          response: {
            200: askScheduleResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: z.union([
              askBlockedFlaggedShiftsResponseSchema,
              errorResponseSchema,
            ]),
            422: preparationValidationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleParticipationRouteParams;
        const { ministryId, answerBy } = request.body as AskScheduleBody;

        const decision = await this.authorityGuard.decideManageMinistry({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        if (
          await this.denyAuthorityDecision({
            request,
            reply,
            allowed: decision.allowed,
          })
        )
          return;

        const result = await this.availabilityCheckManager.askSchedule({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          cycleId: CycleId.from(cycleId),
          answerBy,
        });
        return reply.send(result);
      },
    );

    app.put(
      '/cycles/:cycleId/availability-deadline',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'setAvailabilityDeadline',
          summary: "Set, move or clear a Schedule's Deadline",
          description:
            'Write the answer-by Deadline on the ask record, silently: no Notification is enqueued. Refused before the Ask, on a published Schedule and on a Past Cycle.',
          body: setAvailabilityDeadlineBodySchema,
          response: {
            200: availabilityDeadlineResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            422: preparationValidationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleParticipationRouteParams;
        const { ministryId, answerBy } =
          request.body as SetAvailabilityDeadlineBody;

        const decision = await this.authorityGuard.decideManageMinistry({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        if (
          await this.denyAuthorityDecision({
            request,
            reply,
            allowed: decision.allowed,
          })
        )
          return;

        await this.availabilityCheckManager.setDeadline({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          cycleId: CycleId.from(cycleId),
          answerBy,
        });
        return reply.send({ answerBy });
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
          response: {
            202: askAvailabilityResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
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
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleParticipationRouteParams;
        const { ministryId } = request.query as CycleMinistryQuery;

        const decision = await this.authorityGuard.decideManageMinistry({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        if (
          await this.denyAuthorityDecision({
            request,
            reply,
            allowed: decision.allowed,
          })
        )
          return;

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
          response: {
            200: availabilityStatusResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
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
            "Resend the availability reminder Notification to a MinistryParticipation's unconfirmed Volunteers.",
          response: {
            202: resendAvailabilityResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
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
    const decision = await this.authorityGuard.decideManageParticipation({
      churchId: ChurchId.from(request.churchId),
      participationId: MinistryParticipationId.from(participationId),
      userId: UserId.from(request.userId),
    });

    return this.denyAuthorityDecision({
      request,
      reply,
      allowed: decision.allowed,
    });
  }

  private async denyAuthorityDecision({
    request,
    reply,
    allowed,
  }: DenyAuthorityDecisionInput): Promise<boolean> {
    if (allowed) return false;
    const functionDecision = await this.authorityGuard.decideManageAnyMinistry({
      churchId: ChurchId.from(request.churchId),
      userId: UserId.from(request.userId),
    });
    if (!functionDecision.allowed) {
      refuse({ reply, request, code: 'FORBIDDEN' });
      return true;
    }
    refuse({ reply, request, code: 'NOT_FOUND' });
    return true;
  }
}

interface ToPreparationSplitInput {
  shiftSplit: NonNullable<SavePreparationBody['shiftSplit']>;
}

function toPreparationSplit({
  shiftSplit,
}: ToPreparationSplitInput): ShiftSplitStrategy {
  if (shiftSplit.kind === 'equal') {
    return { kind: 'equal-n', n: shiftSplit.count };
  }
  return {
    kind: 'manual',
    spans: shiftSplit.spans.map((span) => ({
      startTime: parseInstant({ value: span.startTime }),
      endTime: parseInstant({ value: span.endTime }),
      label: span.label,
    })),
  };
}
