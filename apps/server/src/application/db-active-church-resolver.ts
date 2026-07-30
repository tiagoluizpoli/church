import { inject, injectable } from 'tsyringe';
import type { ChurchId, UserId } from '../domain/branded-ids';
import type {
  ActiveChurchResolution,
  IActiveChurchResolver,
  ResolveActiveChurchInput,
} from '../domain/contracts/application/active-church-resolver';
import type { AuthorityActorRepository } from '../domain/contracts/infrastructure/authority-actor.repository';
import type { ChurchMembershipRepository } from '../domain/contracts/infrastructure/church-membership.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';

interface ResolveAgainstChurchInput {
  userId: UserId;
  churchId: ChurchId;
  autoSelected: boolean;
  tx?: TransactionContext;
}

interface ResolveWithNoActiveOrganizationInput {
  userId: UserId;
  tx: TransactionContext;
}

@injectable()
export class DbActiveChurchResolver implements IActiveChurchResolver {
  constructor(
    @inject('IAuthorityActorRepository')
    private readonly actorRepository: AuthorityActorRepository,
    @inject('IChurchMembershipRepository')
    private readonly membershipRepository: ChurchMembershipRepository,
    @inject('IUnitOfWork')
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async resolve(
    input: ResolveActiveChurchInput,
  ): Promise<ActiveChurchResolution> {
    const { userId, activeOrganizationId } = input;

    if (activeOrganizationId) {
      return this.resolveAgainst({
        userId,
        churchId: activeOrganizationId,
        autoSelected: false,
      });
    }

    // `repeatable read` pins both statements to one snapshot: the candidate
    // Membership listed here can't be revoked out from under the actor
    // lookup below within the same transaction, closing the check-then-use
    // gap between "how many Churches" and "resolve against that Church".
    return this.unitOfWork.run(
      (tx) => this.resolveWithNoActiveOrganization({ userId, tx }),
      { isolationLevel: 'repeatable read' },
    );
  }

  private async resolveWithNoActiveOrganization(
    input: ResolveWithNoActiveOrganizationInput,
  ): Promise<ActiveChurchResolution> {
    const { userId, tx } = input;
    const memberships = await this.membershipRepository.listByUserId({
      userId,
      tx,
    });
    const [onlyMembership, ...rest] = memberships;
    if (!onlyMembership) return { status: 'no_membership' };
    if (rest.length > 0) return { status: 'selection_required' };

    return this.resolveAgainst({
      userId,
      churchId: onlyMembership.churchId,
      autoSelected: true,
      tx,
    });
  }

  private async resolveAgainst(
    input: ResolveAgainstChurchInput,
  ): Promise<ActiveChurchResolution> {
    const { userId, churchId, autoSelected, tx } = input;
    const actor = await this.actorRepository.resolveActor({
      userId,
      activeChurchId: churchId,
      tx,
    });

    if (!actor.churchMembership) return { status: 'no_membership' };

    if (autoSelected) {
      // Only the silent-auto-select branch touches "last opened" here — a
      // request against an *already*-active Church resolves through this
      // same method on every call, and must not bump the timestamp each time.
      await this.membershipRepository.touchOpened({ userId, churchId, tx });
    }

    return {
      status: 'resolved',
      churchId,
      volunteerId: actor.volunteerId,
      autoSelected,
    };
  }
}
