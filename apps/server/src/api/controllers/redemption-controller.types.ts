import type { AppConfig } from '@church/app-config';
import type { FastifyRequest } from 'fastify';
import type { UserId } from '../../domain/branded-ids';
import type { IRedemptionManager } from '../../domain/contracts/application/redemption-manager';
import type { IVolunteerTransferManager } from '../../domain/contracts/application/volunteer-transfer-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface AuthenticatedRedeemer {
  userId: ReturnType<typeof UserId.from>;
  /** The caller's own cookie header, forwarded as-is to Better Auth — never minted here. */
  sessionCookie: string;
}

export interface RequireRedeemerInput {
  request: FastifyRequest;
}

export interface RedemptionControllerDependencies {
  redemptionManager: IRedemptionManager;
  volunteerTransferManager: IVolunteerTransferManager;
  sessionGateway: SessionGateway;
  config: AppConfig;
}
