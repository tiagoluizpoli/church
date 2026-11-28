import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IScheduleExportReader } from '../../domain/contracts/application/schedule-export-reader';

export interface ScheduleExportRouteParams {
  ministryId: string;
  cycleId: string;
}

export interface ScheduleExportControllerDependencies {
  scheduleExportReader: IScheduleExportReader;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
}

export interface ScheduleExportRequestInput {
  request: FastifyRequest;
  reply: FastifyReply;
}
