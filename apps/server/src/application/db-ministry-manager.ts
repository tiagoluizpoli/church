import { NotFoundError } from '@church/core';
import { now, toDate } from '@church/time';
import type { ChurchId } from '../domain/branded-ids';
import type {
  ArchiveMinistryInput,
  CreateMinistryInput,
  GetActiveMinistryInput,
  IMinistryManager,
  ListMinistriesByLeaderInput,
  RenameMinistryInput,
  SetDefaultDirectionInput,
} from '../domain/contracts/application/ministry-manager';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryInvitationRepository } from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Ministry } from '../domain/entities/ministry';
import { MinistryInUseError } from '../domain/errors/ministry-in-use';
import { revokeMinistryHalf } from './invitation-revocation';

interface DbMinistryManagerDependencies {
  ministryRepo: MinistryRepository;
  volunteerRepo: VolunteerRepository;
  invitationRepo: MinistryInvitationRepository;
  unitOfWork: UnitOfWork;
}

export class DbMinistryManager implements IMinistryManager {
  private readonly ministryRepo: MinistryRepository;
  private readonly volunteerRepo: VolunteerRepository;
  private readonly invitationRepo: MinistryInvitationRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    ministryRepo,
    volunteerRepo,
    invitationRepo,
    unitOfWork,
  }: DbMinistryManagerDependencies) {
    this.ministryRepo = ministryRepo;
    this.volunteerRepo = volunteerRepo;
    this.invitationRepo = invitationRepo;
    this.unitOfWork = unitOfWork;
  }

  async listByChurch(churchId: ChurchId): Promise<Ministry[]> {
    return this.ministryRepo.listByChurch({ churchId });
  }

  async listByLeader(input: ListMinistriesByLeaderInput): Promise<Ministry[]> {
    const { leaderId, churchId } = input;
    const ledMinistries = await this.volunteerRepo.listLedMinistries({
      churchId,
      volunteerId: leaderId,
    });
    const ids = ledMinistries.map((led) => led.ministryId);
    return this.ministryRepo.listByChurch({ churchId, ids });
  }

  async getActive({
    churchId,
    ministryId,
  }: GetActiveMinistryInput): Promise<Ministry> {
    const ministry = await this.ministryRepo.getById({
      churchId,
      id: ministryId,
    });
    if (ministry.deletedAt) {
      throw new NotFoundError(`Ministry not found: ${ministryId}`);
    }
    return ministry;
  }

  async create(input: CreateMinistryInput): Promise<Ministry> {
    return this.ministryRepo.create(input);
  }

  async rename(input: RenameMinistryInput): Promise<Ministry> {
    return this.ministryRepo.rename(input);
  }

  async archive({
    churchId,
    ministryId,
    callerId,
  }: ArchiveMinistryInput): Promise<void> {
    await this.unitOfWork.run(async (tx) => {
      // The update lock waits for in-flight new-use writes (share locks) and
      // makes later ones see the archive, so the check below cannot go stale.
      const ministry = await this.ministryRepo.lockActive({
        churchId,
        ministryId,
        strength: 'update',
        tx,
      });
      const archivedAt = now();
      const cycles = await this.ministryRepo.listUnendedParticipationCycles({
        churchId,
        ministryId,
        now: archivedAt,
        tx,
      });
      if (cycles.length > 0) {
        throw new MinistryInUseError({
          blockers: cycles.map((cycle) => ({
            kind: 'cycle',
            ministryId,
            ministryName: ministry.name,
            ...cycle,
          })),
        });
      }
      await this.ministryRepo.archive({ churchId, ministryId, archivedAt, tx });
      // Ministry row first, then each Church Invitation in id order, then
      // halves — the lock order every invitation lifecycle transition shares.
      const revocation = {
        actorId: callerId,
        at: toDate({ instant: archivedAt }),
        reason: 'ministry-archived' as const,
      };
      const pending = await this.invitationRepo.listPendingInMinistry({
        churchId,
        ministryId,
        tx,
      });
      for (const half of pending) {
        await revokeMinistryHalf({
          repo: this.invitationRepo,
          churchId,
          ministryInvitationId: half.id,
          churchInvitationId: half.churchInvitationId,
          revocation,
          tx,
        });
      }
    });
  }

  async setDefaultDirection(
    input: SetDefaultDirectionInput,
  ): Promise<Ministry> {
    return this.ministryRepo.updateDefaultDirection(input);
  }
}
