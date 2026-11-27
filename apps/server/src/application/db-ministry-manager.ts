import { NotFoundError } from '@church/core';
import { now, toDate } from '@church/time';
import type { ChurchId, MinistryId } from '../domain/branded-ids';
import type {
  ArchiveMinistryInput,
  CreateMinistryInput,
  GetActiveMinistryInput,
  IMinistryManager,
  ListMinistriesByLeaderInput,
  ListMinistryPageRequest,
  MinistryPage,
  MinistrySummary,
  RenameMinistryInput,
  SetDefaultDirectionInput,
  SummarizeMinistriesInput,
} from '../domain/contracts/application/ministry-manager';
import type { EventTemplateRepository } from '../domain/contracts/infrastructure/event-template.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryInvitationRepository } from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { SectorRepository } from '../domain/contracts/infrastructure/sector.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { UsualSetupRepository } from '../domain/contracts/infrastructure/usual-setup.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Ministry } from '../domain/entities/ministry';
import { MinistryInUseError } from '../domain/errors/ministry-in-use';
import { usualSetupNeedsReview } from '../domain/services/scheduling/usual-setup-planner';
import { revokeMinistryHalf } from './invitation-revocation';

interface ReviewIdsInput {
  churchId: ChurchId;
}

interface SummarizeWithInput extends SummarizeMinistriesInput {
  reviewIds: ReadonlySet<MinistryId>;
}

interface DbMinistryManagerDependencies {
  ministryRepo: MinistryRepository;
  volunteerRepo: VolunteerRepository;
  invitationRepo: MinistryInvitationRepository;
  unitOfWork: UnitOfWork;
  sectorRepo: SectorRepository;
  roleRepo: RoleRepository;
  usualSetupRepo: UsualSetupRepository;
  templateRepo: EventTemplateRepository;
}

export class DbMinistryManager implements IMinistryManager {
  private readonly ministryRepo: MinistryRepository;
  private readonly volunteerRepo: VolunteerRepository;
  private readonly invitationRepo: MinistryInvitationRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly sectorRepo: SectorRepository;
  private readonly roleRepo: RoleRepository;
  private readonly usualSetupRepo: UsualSetupRepository;
  private readonly templateRepo: EventTemplateRepository;

  constructor({
    ministryRepo,
    volunteerRepo,
    invitationRepo,
    unitOfWork,
    sectorRepo,
    roleRepo,
    usualSetupRepo,
    templateRepo,
  }: DbMinistryManagerDependencies) {
    this.ministryRepo = ministryRepo;
    this.volunteerRepo = volunteerRepo;
    this.invitationRepo = invitationRepo;
    this.unitOfWork = unitOfWork;
    this.sectorRepo = sectorRepo;
    this.roleRepo = roleRepo;
    this.usualSetupRepo = usualSetupRepo;
    this.templateRepo = templateRepo;
  }

  async summarize({
    churchId,
    ministries,
  }: SummarizeMinistriesInput): Promise<Map<MinistryId, MinistrySummary>> {
    return this.summarizeWith({
      churchId,
      ministries,
      reviewIds: await this.reviewIds({ churchId }),
    });
  }

  /** Summaries given the Ministries needing review, so a caller that has them loads them once. */
  private async summarizeWith({
    churchId,
    ministries,
    reviewIds,
  }: SummarizeWithInput): Promise<Map<MinistryId, MinistrySummary>> {
    const ministryIds = ministries.map((ministry) => ministry.id);
    const [sectorCounts, roleCounts] = await Promise.all([
      this.sectorRepo.countActiveByMinistry({ churchId, ministryIds }),
      this.roleRepo.countActiveByMinistry({ churchId, ministryIds }),
    ]);
    return new Map(
      ministryIds.map((id) => [
        id,
        {
          sectorCount: sectorCounts.get(id) ?? 0,
          roleCount: roleCounts.get(id) ?? 0,
          needsReview: reviewIds.has(id),
        },
      ]),
    );
  }

  async listPage({
    churchId,
    ministryIds,
    search,
    status,
    cursor,
    limit,
  }: ListMinistryPageRequest): Promise<MinistryPage> {
    const reviewIds = await this.reviewIds({ churchId });
    const page = await this.ministryRepo.listPage({
      churchId,
      ids: ministryIds,
      search,
      status,
      reviewIds: [...reviewIds],
      cursor,
      limit,
    });
    const summaries = await this.summarizeWith({
      churchId,
      ministries: page.ministries,
      reviewIds,
    });
    return { ...page, summaries };
  }

  /** Ministries with any Usual setup block needing review, by the domain rule. */
  private async reviewIds({
    churchId,
  }: ReviewIdsInput): Promise<Set<MinistryId>> {
    const [setups, templates] = await Promise.all([
      this.usualSetupRepo.listByChurch({ churchId }),
      this.templateRepo.list({ churchId }),
    ]);
    const blocks = new Map(
      templates
        .flatMap((template) => template.blocks)
        .map((block) => [block.id, block]),
    );
    return new Set(
      setups
        .filter((entry) => {
          const block = blocks.get(entry.sourceTemplateTimeBlockId);
          return block !== undefined && usualSetupNeedsReview({ entry, block });
        })
        .map((entry) => entry.ministryId),
    );
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
