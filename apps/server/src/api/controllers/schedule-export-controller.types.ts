import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type {
  IScheduleExportReader,
  ScheduleExportData,
  ScheduleExportLayout,
  ScheduleExportPart,
} from '../../domain/contracts/application/schedule-export-reader';

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

export interface ScheduleExportLayoutInput {
  format: 'pdf' | 'png';
  layout: ScheduleExportLayout;
}

export interface ScheduleExportPartInput {
  data: ScheduleExportData;
  format: 'pdf' | 'png';
  /** 1-based. */
  part: number;
}

/** The data one file renders, and the part it names when it holds only one. */
export interface ScheduleExportFilePart {
  data: ScheduleExportData;
  part?: ScheduleExportPart;
}
