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
import type { Assignment } from '../../domain/entities/assignment';
import type {
  applyAssignmentProposalBodySchema,
  createParticipationAssignmentBodySchema,
  moveAssignmentBodySchema,
  reassignAssignmentBodySchema,
} from '../dtos/assign.dto';
import type { publishCycleBodySchema } from '../dtos/cycle-builder.dto';

export interface CycleMinistryQuery {
  ministryId: string;
}

export type CreateParticipationAssignmentBody = z.infer<
  typeof createParticipationAssignmentBodySchema
>;

export type PublishCycleBody = z.infer<typeof publishCycleBodySchema>;

export type ApplyAssignmentProposalBody = z.infer<
  typeof applyAssignmentProposalBodySchema
>;

export type ReviewedPairBody = ApplyAssignmentProposalBody['additions'][number];

export type MoveAssignmentBody = z.infer<typeof moveAssignmentBodySchema>;

export type ReassignAssignmentBody = z.infer<
  typeof reassignAssignmentBodySchema
>;

export interface ResolveOwnedAssignmentInput {
  request: FastifyRequest;
  reply: FastifyReply;
  assignmentId: string;
}

export interface ResolveOwnedAssignmentResult {
  assignment?: Assignment;
  denied: boolean;
}

export interface ResolveScheduleShiftInput {
  request: FastifyRequest;
  reply: FastifyReply;
  shiftId: string;
}

export interface DenyAuthorityDecisionInput {
  request: FastifyRequest;
  reply: FastifyReply;
  allowed: boolean;
}

export interface DenyParticipationScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  participationId: string;
}

export interface DenyShiftScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  shiftId: string;
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
