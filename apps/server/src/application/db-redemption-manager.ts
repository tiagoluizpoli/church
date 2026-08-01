import { injectable } from 'tsyringe';
import type { VolunteerId } from '../domain/branded-ids';
import type {
  AcceptPendingMinistryInvitationInput,
  RedemptionManager,
} from '../domain/contracts/application/redemption-manager';
import type { RedemptionRepository } from '../domain/contracts/infrastructure/redemption.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';

export interface DbRedemptionManagerDependencies {
  redemptionRepository: RedemptionRepository;
  unitOfWork: UnitOfWork;
}

/**
 * Checkpoint three from spec §7.4. This is intentionally transport-free: #99
 * will authenticate and call it, while this operation owns the sole database
 * transaction that creates grants and consumes the Ministry Invitation.
 */
@injectable()
export class DbRedemptionManager implements RedemptionManager {
  constructor({
    redemptionRepository,
    unitOfWork,
  }: DbRedemptionManagerDependencies) {
    this.redemptionRepository = redemptionRepository;
    this.unitOfWork = unitOfWork;
  }

  private readonly redemptionRepository: RedemptionRepository;
  private readonly unitOfWork: UnitOfWork;

  async acceptPendingMinistryInvitation({
    churchId,
    ministryInvitationId,
    userId,
    acceptedAt,
  }: AcceptPendingMinistryInvitationInput): Promise<VolunteerId> {
    return this.unitOfWork.run((tx) =>
      this.redemptionRepository.acceptPendingMinistryInvitation({
        churchId,
        ministryInvitationId,
        userId,
        acceptedAt,
        tx,
      }),
    );
  }
}
