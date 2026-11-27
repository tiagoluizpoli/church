import type { AppConfig } from '@church/app-config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IAvailabilityCheckManager } from '../../domain/contracts/application/availability-check-manager';
import type { IPrepareManager } from '../../domain/contracts/application/prepare-manager';
import type { IScheduleReadModel } from '../../domain/contracts/application/schedule-read-model';
import type {
  askScheduleBodySchema,
  remindScheduleBodySchema,
  SavePreparationBody,
  scheduleListQuerystringSchema,
  setAvailabilityDeadlineBodySchema,
} from '../dtos/participation.dto';

export interface CycleParticipationRouteParams {
  cycleId: string;
}

export interface ScheduleSummaryRouteParams {
  ministryId: string;
}

export interface CycleMinistryQuery {
  ministryId: string;
}

export type AskScheduleBody = z.infer<typeof askScheduleBodySchema>;

export type RemindScheduleBody = z.infer<typeof remindScheduleBodySchema>;

export type SetAvailabilityDeadlineBody = z.infer<
  typeof setAvailabilityDeadlineBodySchema
>;

export interface ParticipationEventTimeBlockRouteParams {
  participationId: string;
  eventTimeBlockId: string;
}

export interface DenyParticipationScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  participationId: string;
}

export interface DenyAuthorityDecisionInput {
  request: FastifyRequest;
  reply: FastifyReply;
  allowed: boolean;
}

export interface PrepareControllerDependencies {
  prepareManager: IPrepareManager;
  scheduleReadModel: IScheduleReadModel;
  availabilityCheckManager: IAvailabilityCheckManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
  config: AppConfig;
}

/** The page size the route's own schema bounds by the configured maximum. */
export interface ListLimitQuery {
  limit: number;
}

export type ScheduleListQuery = z.infer<typeof scheduleListQuerystringSchema> &
  ListLimitQuery;

export interface ToPreparationSplitInput {
  shiftSplit: NonNullable<SavePreparationBody['shiftSplit']>;
}
