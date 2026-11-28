import type { AppConfig } from '@church/app-config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserId } from '../../domain/branded-ids';
import type { IRedemptionManager } from '../../domain/contracts/application/redemption-manager';
import type { IVolunteerTransferManager } from '../../domain/contracts/application/volunteer-transfer-manager';

export interface AuthenticatedRedeemer {
  userId: ReturnType<typeof UserId.from>;
  /** The caller's own cookie header, forwarded as-is to Better Auth — never minted here. */
  sessionCookie: string;
}

export interface RequireRedeemerInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

/** The restricted preview field set the existing-member route exposes (spec §7.1). */
export interface InvitationPreviewFields {
  email: string;
  churchName: string;
  ministryName: string;
  ministryAccessLevel: 'volunteer' | 'leader';
  roleNames: string[];
  expiresAt: Date;
}

export interface RedemptionControllerDependencies {
  redemptionManager: IRedemptionManager;
  volunteerTransferManager: IVolunteerTransferManager;
  config: AppConfig;
}

export interface ControllerRateLimitInput {
  key: string;
}
