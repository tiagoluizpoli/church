import { parseInstant } from '@church/time';
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
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IAvailabilityCheckManager } from '../../domain/contracts/application/availability-check-manager';
import type { IPrepareManager } from '../../domain/contracts/application/prepare-manager';
import type { IScheduleReadModel } from '../../domain/contracts/application/schedule-read-model';
import type { ShiftSplitStrategy } from '../../domain/services/shift-splitter';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { FastifyController } from '../contracts/fastify-controller';
import { pageLimitSchema } from '../dtos/page-limit.dto';
import {
  answersQuerystringSchema,
  answersResponseSchema,
  askBlockedFlaggedShiftsResponseSchema,
  askPreviewResponseSchema,
  askScheduleBodySchema,
  askScheduleResponseSchema,
  availabilityDeadlineResponseSchema,
  cycleParticipationQuerystringSchema,
  cycleParticipationResponseSchema,
  headcountBelowAssignedResponseSchema,
  participationEventTimeBlockViewSchema,
  participationMapper,
  preparationValidationErrorResponseSchema,
  remindOnCooldownResponseSchema,
  remindScheduleBodySchema,
  remindScheduleResponseSchema,
  type SavePreparationBody,
  savePreparationBodySchema,
  scheduleInsightsResponseSchema,
  scheduleListQuerystringSchema,
  scheduleListResponseSchema,
  scheduleResponseSchema,
  scheduleRouteParamsSchema,
  scheduleSummaryListResponseSchema,
  setAvailabilityDeadlineBodySchema,
  shiftHasResponsesResponseSchema,
} from '../dtos/participation.dto';
import { refuse } from '../utils/refuse';
import type {
  AskScheduleBody,
  CycleMinistryQuery,
  CycleParticipationRouteParams,
  DenyAuthorityDecisionInput,
  DenyParticipationScopeInput,
  ListLimitQuery,
  ParticipationEventTimeBlockRouteParams,
  PrepareControllerDependencies,
  RemindScheduleBody,
  ScheduleListQuery,
  ScheduleSummaryRouteParams,
  SetAvailabilityDeadlineBody,
  ToPreparationSplitInput,
} from './prepare-controller.types';

const cycleParticipationQuerySchema = z.object({
  ministryId: z.string(),
});

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export class PrepareController implements FastifyController {
  readonly prefix = '/prepare';

  private readonly prepareManager: IPrepareManager;
  private readonly scheduleReadModel: IScheduleReadModel;
  private readonly availabilityCheckManager: IAvailabilityCheckManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;
  private readonly schedulePageSize: number;
  private readonly scheduleMaxPageSize: number;
  private readonly answersMaxPageSize: number;

  constructor({
    prepareManager,
    scheduleReadModel,
    availabilityCheckManager,
    activeChurchResolver,
    authorityGuard,
    config,
  }: PrepareControllerDependencies) {
    this.schedulePageSize = config.schedules.pageSize;
    this.scheduleMaxPageSize = config.schedules.maxPageSize;
    this.answersMaxPageSize = config.people.answersMaxPageSize;
    this.prepareManager = prepareManager;
    this.scheduleReadModel = scheduleReadModel;
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
            "List one row per Ministry and Cycle with its derived stage: every active Ministry for a ChurchAdmin, the led ones for a leader. `period` picks Sent Cycles (`current`, the default), Past Cycles or both. Ministry, stage, search (Ministry or Cycle name) and `attention` (current Schedules that wait on the leader: not serving excluded, Published only with an open Swap request) filters combine before pagination. Current Schedules come first by stage (to prepare, asking, assigning, published, not serving), then Past ones; within each, newest Cycle first, then Ministry name. `counts` covers the caller's current Schedules per stage: it ignores the filters and the cursor, so every page repeats the same values.",
          querystring: scheduleListQuerystringSchema.extend({
            limit: pageLimitSchema({
              maxPageSize: this.scheduleMaxPageSize,
            }).default(this.schedulePageSize),
          }),
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

        const { cursor, limit, ministryId, ...filters } =
          request.query as ScheduleListQuery;
        const page = await this.scheduleReadModel.listSchedules({
          churchId,
          ministryIds: isChurchAdmin
            ? undefined
            : ledMinistries.map(({ ministryId }) => ministryId),
          filters: {
            ...filters,
            ministryId: ministryId ? MinistryId.from(ministryId) : undefined,
          },
          cursor,
          limit,
        });
        return reply.send(participationMapper.scheduleListToResponse(page));
      },
    );

    app.get(
      '/insights',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'getScheduleInsights',
          summary: "Staffing trends of the caller's Schedules",
          description:
            "Totals over the caller's Ministries (every active one for a ChurchAdmin, the led ones for a leader): for each of the latest six Sent or Past Cycles, oldest first, the requirement headcount (`needed`), the seats held by a draft or pending assignment (`filled`, capped per requirement), and availability checks asked and answered; plus, for the Cycle running on the Church's today (else the latest), the same staffing totals per serving Ministry, least covered first, then by name. Cancelled Events, inactive blocks and archived Ministries, Sectors and Roles are left out.",
          response: {
            200: scheduleInsightsResponseSchema,
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
        const insights = await this.scheduleReadModel.getScheduleInsights({
          churchId,
          ministryIds: isChurchAdmin
            ? undefined
            : ledMinistries.map(({ ministryId }) => ministryId),
        });
        return reply.send(insights);
      },
    );

    app.get(
      '/schedules/:ministryId/:cycleId',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'getSchedule',
          summary: "Get one of the caller's Schedules",
          description:
            "Read one Ministry's Schedule of one Sent or Past Cycle, shaped as a `listSchedules` row. 404 when the Ministry is archived or outside the caller's led Ministries (a ChurchAdmin reaches every active one), the Cycle is a Draft, or either is unknown.",
          params: scheduleRouteParamsSchema,
          response: {
            200: scheduleResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
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
        const { ministryId, cycleId } = request.params as z.infer<
          typeof scheduleRouteParamsSchema
        >;
        const schedule = await this.scheduleReadModel.getSchedule({
          churchId,
          ministryIds: isChurchAdmin
            ? undefined
            : ledMinistries.map(({ ministryId }) => ministryId),
          ministryId: MinistryId.from(ministryId),
          cycleId: CycleId.from(cycleId),
        });
        return reply.send(participationMapper.scheduleToResponse(schedule));
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
            "Get a Ministry's MinistryParticipation prepare state across every Event in a Cycle. `day` (church-local date), `q` (block label or Event title), a time window (`timeMode` starts, ends or within, with `timeFrom`/`timeTo` as church-local HH:mm; either bound may be omitted) and `needsAttention` (served blocks with a Shift lacking a headcount) filter the blocks; Events left with none are dropped. Blocks come ordered by start then id. `dayMarkers` and `totals` always describe the unfiltered Cycle.",
          querystring: cycleParticipationQuerystringSchema,
          response: {
            200: cycleParticipationResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleParticipationRouteParams;
        const {
          ministryId,
          day,
          q,
          timeMode,
          timeFrom,
          timeTo,
          needsAttention,
        } = request.query as z.infer<
          typeof cycleParticipationQuerystringSchema
        >;

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

        const view = await this.prepareManager.getCycleParticipation({
          churchId: ChurchId.from(request.churchId),
          cycleId: CycleId.from(cycleId),
          ministryId: MinistryId.from(ministryId),
          filters: {
            day,
            q,
            needsAttention,
            timeWindow: { mode: timeMode, start: timeFrom, end: timeTo },
          },
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

        const views = await this.scheduleReadModel.listScheduleSummaries({
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
            'Apply the complete desired Serves, Shift split and headcounts of one EventTimeBlock in one transaction. Omitted or zero headcounts remove their ShiftRequirement; other blocks are untouched. Serving with neither split nor headcounts opts a block with no Shifts in from the Usual setup. A headcount cannot drop below its active Assignments. Re-splitting, deleting a Shift or opting out is refused while an affected Shift carries UnavailableShift marks or active Assignments. A block under a cancelled Event or EventTimeBlock is refused as EVENT_CANCELLED or EVENT_TIME_BLOCK_CANCELLED.',
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
        const view = await this.prepareManager.savePreparation({
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
      '/cycles/:cycleId/remind-availability',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'remindSchedule',
          summary: 'Remind a Schedule',
          description:
            'In one transaction, create checks and enqueue availability_opened for newly eligible Volunteers, enqueue availability_reminder for every not-confirmed check and stamp the cooldown, even with zero recipients. Refused before the Ask, after publish, on a Past Cycle and inside the cooldown.',
          body: remindScheduleBodySchema,
          response: {
            200: remindScheduleResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: z.union([remindOnCooldownResponseSchema, errorResponseSchema]),
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleParticipationRouteParams;
        const { ministryId } = request.body as RemindScheduleBody;

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

        const result = await this.availabilityCheckManager.remindSchedule({
          churchId: ChurchId.from(request.churchId),
          ministryId: MinistryId.from(ministryId),
          cycleId: CycleId.from(cycleId),
        });
        return reply.send(result);
      },
    );

    app.get(
      '/cycles/:cycleId/availability-status',
      {
        schema: {
          tags: ['prepare'],
          operationId: 'getCycleAvailabilityStatus',
          summary: "Get the Answers to a Schedule's Ask",
          description:
            'List the asked Volunteers with their marks and relevant Shift totals, plus the confirmed counts, per-status `counts`, Deadline and Remind cooldown. `status` (pending, available, unavailable) and `q` (name search) filter the list; `limit` pages it by `cursor` (omitted, every match comes back) ordered by name then id, and `nextCursor` is null on the last page. `asked`, `confirmed` and `counts` ignore the filters.',
          querystring: answersQuerystringSchema.extend({
            limit: pageLimitSchema({
              maxPageSize: this.answersMaxPageSize,
            }).optional(),
          }),
          response: {
            200: answersResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params as CycleParticipationRouteParams;
        const { ministryId, status, q, cursor, limit } =
          request.query as z.infer<typeof answersQuerystringSchema> &
            Partial<ListLimitQuery>;

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

        const answers =
          await this.availabilityCheckManager.listCycleCheckStatuses({
            churchId: ChurchId.from(request.churchId),
            cycleId: CycleId.from(cycleId),
            ministryId: MinistryId.from(ministryId),
            status,
            q,
            cursor,
            limit,
          });
        return reply.send(answers);
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
