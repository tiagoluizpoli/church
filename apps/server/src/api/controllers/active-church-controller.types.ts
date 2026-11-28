import type { FastifyRequest } from 'fastify';
import type {
  ActiveChurchResolution,
  IActiveChurchResolver,
} from '../../domain/contracts/application/active-church-resolver';
import type { IActiveChurchSelectionManager } from '../../domain/contracts/application/active-church-selection-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface BuildStatusResponseInput {
  resolution: ActiveChurchResolution;
}

export interface RequireSessionInput {
  sessionGateway: SessionGateway;
  request: FastifyRequest;
}

/**
 * Entry-gate status and the compare-access selector (spec.md §1.5). Deliberately
 * outside `createActiveChurchPreValidation`'s hook: every route here must work
 * *before* an Active Church exists — `selection_required` is this controller's
 * normal, 200-status result, never a denial.
 */
export interface ActiveChurchControllerDependencies {
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  selectionManager: IActiveChurchSelectionManager;
}
