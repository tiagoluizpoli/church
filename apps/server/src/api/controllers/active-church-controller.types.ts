import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  ActiveChurchResolution,
  IActiveChurchResolver,
} from '../../domain/contracts/application/active-church-resolver';
import type { IActiveChurchSelectionManager } from '../../domain/contracts/application/active-church-selection-manager';

export interface BuildStatusResponseInput {
  resolution: ActiveChurchResolution;
}

export interface RequireSessionInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

export interface AuthenticatedSession {
  userId: string;
  activeOrganizationId: string | null;
}

/**
 * Entry-gate status and the compare-access selector (spec.md §1.5). Deliberately
 * outside `createActiveChurchPreValidation`'s hook: every route here must work
 * *before* an Active Church exists — `selection_required` is this controller's
 * normal, 200-status result, never a denial.
 */
export interface ActiveChurchControllerDependencies {
  activeChurchResolver: IActiveChurchResolver;
  selectionManager: IActiveChurchSelectionManager;
}
