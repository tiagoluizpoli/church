import type { AppConfig } from '@church/app-config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAssignmentManager } from '../../domain/contracts/application/assignment-manager';
import type { IAssignmentProposalManager } from '../../domain/contracts/application/assignment-proposal-manager';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IScheduleBuilderReader } from '../../domain/contracts/application/schedule-builder-reader';
import type { ISchedulePublisher } from '../../domain/contracts/application/schedule-publisher';
import type { IScheduleReadModel } from '../../domain/contracts/application/schedule-read-model';
import type { applyAssignmentProposalBodySchema } from '../dtos/assign.dto';

export type ApplyAssignmentProposalBody = z.infer<
  typeof applyAssignmentProposalBodySchema
>;

export type ReviewedPairBody = ApplyAssignmentProposalBody['additions'][number];

export interface DenyAssignmentScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  assignmentId: string;
}

export interface AssignControllerDependencies {
  scheduleBuilderReader: IScheduleBuilderReader;
  assignmentProposalManager: IAssignmentProposalManager;
  scheduleReadModel: IScheduleReadModel;
  schedulePublisher: ISchedulePublisher;
  assignmentManager: IAssignmentManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
  config: AppConfig;
}
