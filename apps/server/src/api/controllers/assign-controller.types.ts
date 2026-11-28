import type { AppConfig } from '@church/app-config';
import type { FastifyRequest } from 'fastify';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAssignmentManager } from '../../domain/contracts/application/assignment-manager';
import type { IAssignmentProposalManager } from '../../domain/contracts/application/assignment-proposal-manager';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IScheduleBuilderReader } from '../../domain/contracts/application/schedule-builder-reader';
import type { ISchedulePublisher } from '../../domain/contracts/application/schedule-publisher';
import type { IScheduleReadModel } from '../../domain/contracts/application/schedule-read-model';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface AssertAssignmentScopeInput {
  request: FastifyRequest;
  assignmentId: string;
}

export interface AssignControllerDependencies {
  scheduleBuilderReader: IScheduleBuilderReader;
  assignmentProposalManager: IAssignmentProposalManager;
  scheduleReadModel: IScheduleReadModel;
  schedulePublisher: ISchedulePublisher;
  assignmentManager: IAssignmentManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
  config: AppConfig;
}
