import { AuthorityService } from '../domain/authority/authority-service';
import type { ChurchId, UserId } from '../domain/branded-ids';
import type {
  ActiveChurchResolution,
  IActiveChurchResolver,
  ResolveActiveChurchInput,
} from '../domain/contracts/application/active-church-resolver';
import type { AuthorityActorRepository } from '../domain/contracts/infrastructure/authority-actor.repository';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
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

interface ResolveAfterMembershipRemovedInput {
  userId: UserId;
  formerChurchId: ChurchId;
}

/** Only the silent auto-select touches "last opened": a request against an
 * already-active Church must not bump it on every call. */
interface AutoSelectChurchInput {
  userId: UserId;
}

interface DbActiveChurchResolverDependencies {
  actorRepository: AuthorityActorRepository;
  membershipRepository: ChurchMembershipRepository;
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
}

export class DbActiveChurchResolver implements IActiveChurchResolver {
  private readonly actorRepository: AuthorityActorRepository;
  private readonly membershipRepository: ChurchMembershipRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    actorRepository,
    membershipRepository,
    churchRepository,
    unitOfWork,
  }: DbActiveChurchResolverDependencies) {
    this.actorRepository = actorRepository;
    this.membershipRepository = membershipRepository;
    this.churchRepository = churchRepository;
    this.unitOfWork = unitOfWork;
  }

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
    return this.autoSelectChurch({ userId });
  }

  /**
   * Resolves under one snapshot, then records "last opened" after commit. The
   * touch is only a recency hint: inside the repeatable-read transaction, two
   * concurrent auto-selects of one Church would conflict on the same row and
   * fail the read with a serialization error.
   */
  private async autoSelectChurch({
    userId,
  }: AutoSelectChurchInput): Promise<ActiveChurchResolution> {
    const resolution = await this.unitOfWork.runWith({
      work: (tx) => this.resolveWithNoActiveOrganization({ userId, tx }),
      isolationLevel: 'repeatable read',
    });
    if (resolution.status === 'resolved' && resolution.autoSelected) {
      await this.membershipRepository.touchOpened({
        userId,
        churchId: resolution.churchId,
      });
    }
    return resolution;
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

    if (!actor.churchMembership) {
      // A membership that vanishes between the count-check and this actor
      // lookup within the same repeatable-read transaction would otherwise
      // recurse into this same branch forever — fall back to a plain deny.
      if (autoSelected) return { status: 'no_membership' };
      return this.resolveAfterMembershipRemoved({
        userId,
        formerChurchId: churchId,
      });
    }

    return {
      status: 'resolved',
      churchId,
      volunteerId: actor.volunteerId,
      hasVolunteerMembership: AuthorityService.authorize({
        actor,
        action: 'participate',
        resource: { type: 'church', churchId },
      }).allowed,
      autoSelected,
    };
  }

  /**
   * The session named an active organization whose Church Membership just
   * came back empty — the Membership was removed out from under the caller.
   * Re-derives the correct outcome from the caller's *remaining* Memberships
   * (several -> selection_required, one -> silent auto-select, none ->
   * no_membership) and tags it with the former Church's name so the client
   * can explain what happened without naming who removed the caller.
   */
  private async resolveAfterMembershipRemoved(
    input: ResolveAfterMembershipRemovedInput,
  ): Promise<ActiveChurchResolution> {
    const { userId, formerChurchId } = input;
    const formerChurch = await this.churchRepository.getById({
      id: formerChurchId,
    });

    const resolution = await this.autoSelectChurch({ userId });

    return { ...resolution, membershipRemovedFrom: formerChurch.name };
  }
}
