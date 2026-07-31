import { NotFoundError } from '@church/core';
import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type { ChurchId, MinistryId, UserId } from '../domain/branded-ids';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type {
  IMinistryInvitationManager,
  MintMinistryInvitationInput,
  ResendMinistryInvitationInput,
} from '../domain/contracts/application/ministry-invitation-manager';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type {
  ChurchInvitationSummary,
  MinistryInvitationRepository,
} from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { MinistryInvitation } from '../domain/entities/ministry-invitation';
import { InsufficientInvitationAuthorityError } from '../domain/errors/insufficient-invitation-authority';
import { InvalidInvitationRoleError } from '../domain/errors/invalid-invitation-role';
import { InviteeAlreadyMinistryMemberError } from '../domain/errors/invitee-already-ministry-member';
import { MinistryInvitationNotFoundError } from '../domain/errors/ministry-invitation-not-found';

const MINISTRY_ONLY_INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface EnsureMintableScopeInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  callerId: UserId;
}

interface MintableScope {
  callerIsAdmin: boolean;
}

interface MintForExistingMemberInput extends MintMinistryInvitationInput {
  inviteeUserId: UserId;
  tx: TransactionContext;
}

interface MintChainedInput extends MintMinistryInvitationInput {
  tx: TransactionContext;
}

interface ResolveChainedChurchInvitationInput {
  churchId: MintMinistryInvitationInput['churchId'];
  email: string;
  inviterId: UserId;
  tx: TransactionContext;
}

@injectable()
export class DbMinistryInvitationManager implements IMinistryInvitationManager {
  constructor(
    @inject('IMinistryInvitationRepository')
    private readonly repo: MinistryInvitationRepository,
    @inject('IRoleRepository')
    private readonly roleRepository: RoleRepository,
    @inject('IMinistryRepository')
    private readonly ministryRepository: MinistryRepository,
    @inject('IAuthorityManager')
    private readonly authorityManager: IAuthorityManager,
    @inject('IUnitOfWork')
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async mint(input: MintMinistryInvitationInput): Promise<MinistryInvitation> {
    const { churchId, ministryId, inviterId, ministryAccessLevel, roleIds } =
      input;

    const { callerIsAdmin } = await this.ensureMintableScope({
      churchId,
      ministryId,
      callerId: inviterId,
    });

    if (!callerIsAdmin && ministryAccessLevel === 'leader') {
      throw new InsufficientInvitationAuthorityError();
    }

    const ministryRoles = await this.roleRepository.listByMinistry(
      churchId,
      ministryId,
    );
    const validRoleIds = new Set(ministryRoles.map((role) => role.id));
    if (!roleIds.every((roleId) => validRoleIds.has(roleId))) {
      throw new InvalidInvitationRoleError();
    }

    return this.unitOfWork.run(async (tx) => {
      const inviteeUserId = await this.repo.findChurchMemberByEmail({
        churchId,
        email: input.email,
        tx,
      });

      return inviteeUserId
        ? this.mintForExistingMember({ ...input, inviteeUserId, tx })
        : this.mintChained({ ...input, tx });
    });
  }

  async resend(
    input: ResendMinistryInvitationInput,
  ): Promise<MinistryInvitation> {
    const { churchId, ministryId, ministryInvitationId, callerId } = input;

    await this.ensureMintableScope({ churchId, ministryId, callerId });

    return this.unitOfWork.run(async (tx) => {
      const existing = await this.repo.findPendingById({
        churchId,
        ministryId,
        ministryInvitationId,
        tx,
      });
      if (!existing) throw new MinistryInvitationNotFoundError();

      const expiresAt = new Date(Date.now() + MINISTRY_ONLY_INVITATION_TTL_MS);
      const invitation = await this.repo.refreshExpiry({
        churchId,
        ministryInvitation: existing,
        expiresAt,
        tx,
      });

      await this.repo.enqueueOutboxMessage({
        churchId,
        kind:
          existing.kind === 'chained'
            ? 'invitation.chained'
            : 'invitation.ministry',
        payload: { ministryInvitationId: invitation.id },
        correlationId: crypto.randomUUID(),
        scheduledFor: new Date(),
        tx,
      });

      return invitation;
    });
  }

  private async mintForExistingMember(
    input: MintForExistingMemberInput,
  ): Promise<MinistryInvitation> {
    const {
      churchId,
      ministryId,
      ministryAccessLevel,
      inviterId,
      inviteeUserId,
      roleIds,
      tx,
    } = input;

    const alreadyMember = await this.repo.hasActiveMinistryMembership({
      churchId,
      ministryId,
      userId: inviteeUserId,
      tx,
    });
    if (alreadyMember) throw new InviteeAlreadyMinistryMemberError();

    const existing = await this.repo.findPendingByInvitee({
      churchId,
      ministryId,
      inviteeUserId,
      tx,
    });

    const expiresAt = new Date(Date.now() + MINISTRY_ONLY_INVITATION_TTL_MS);
    const invitation = existing
      ? await this.repo.refreshExpiry({
          churchId,
          ministryInvitation: existing,
          expiresAt,
          tx,
        })
      : await this.repo.create({
          churchId,
          ministryId,
          ministryAccessLevel,
          inviterId,
          inviteeUserId,
          roleIds,
          expiresAt,
          tx,
        });

    await this.repo.enqueueOutboxMessage({
      churchId,
      kind: 'invitation.ministry',
      payload: { ministryInvitationId: invitation.id },
      correlationId: crypto.randomUUID(),
      scheduledFor: new Date(),
      tx,
    });

    return invitation;
  }

  private async mintChained(
    input: MintChainedInput,
  ): Promise<MinistryInvitation> {
    const {
      churchId,
      ministryId,
      ministryAccessLevel,
      inviterId,
      email,
      roleIds,
      tx,
    } = input;

    const churchInvitationSummary = await this.resolveChainedChurchInvitation({
      churchId,
      email,
      inviterId,
      tx,
    });

    const existing = await this.repo.findPendingByChurchInvitation({
      churchId,
      ministryId,
      churchInvitationId: churchInvitationSummary.id,
      tx,
    });

    const invitation = existing
      ? await this.repo.refreshExpiry({
          churchId,
          ministryInvitation: existing,
          expiresAt: churchInvitationSummary.expiresAt,
          tx,
        })
      : await this.repo.create({
          churchId,
          ministryId,
          ministryAccessLevel,
          inviterId,
          churchInvitationId: churchInvitationSummary.id,
          roleIds,
          expiresAt: churchInvitationSummary.expiresAt,
          tx,
        });

    await this.repo.enqueueOutboxMessage({
      churchId,
      kind: 'invitation.chained',
      payload: {
        ministryInvitationId: invitation.id,
        churchInvitationId: churchInvitationSummary.id,
      },
      correlationId: crypto.randomUUID(),
      scheduledFor: new Date(),
      tx,
    });

    return invitation;
  }

  private async resolveChainedChurchInvitation(
    input: ResolveChainedChurchInvitationInput,
  ): Promise<ChurchInvitationSummary> {
    const { churchId, email, inviterId, tx } = input;
    const existing = await this.repo.findPendingChurchInvitationByEmail({
      churchId,
      email,
      tx,
    });
    if (existing) return existing;
    return this.repo.createChainedChurchInvitation({
      churchId,
      email,
      inviterId,
      tx,
    });
  }

  /**
   * A nonexistent Ministry, one outside the Active Church, and one the
   * caller has no authority to manage are deliberately indistinguishable —
   * all three throw the same `MinistryInvitationNotFoundError` so nobody can
   * map another congregation's structure by probing.
   */
  private async ensureMintableScope(
    input: EnsureMintableScopeInput,
  ): Promise<MintableScope> {
    const { churchId, ministryId, callerId } = input;

    try {
      await this.ministryRepository.getById(churchId, ministryId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new MinistryInvitationNotFoundError();
      }
      throw error;
    }

    const canManage = await this.authorityManager.canManageMinistry({
      churchId,
      ministryId,
      userId: callerId,
    });
    if (!canManage) throw new MinistryInvitationNotFoundError();

    const callerIsAdmin = await this.authorityManager.canManageChurch({
      churchId,
      userId: callerId,
    });

    return { callerIsAdmin };
  }
}
