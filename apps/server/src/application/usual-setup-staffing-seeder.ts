import type { EventId, MinistryId } from '../domain/branded-ids';
import type {
  IncludedPlan,
  IUsualSetupStaffingSeeder,
  LoadUsualSetupSeedContextInput,
  PlanForInput,
  SeedParticipationBlockInput,
  SeedStaffingInput,
  StaffingSeedEventTimeBlock,
  UsualSetupSeedContext,
  UsualSetupStaffingSeederDependencies,
  WritePlanInput,
} from '../domain/contracts/application/usual-setup-staffing-seeder';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { UsualSetupRepository } from '../domain/contracts/infrastructure/usual-setup.repository';
import { Shift } from '../domain/entities/shift';
import type {
  IProfileSeeder,
  ParticipationSeedPlan,
  ProfileSeederEntry,
} from '../domain/services/church-identity/profile-seeder.types';

/**
 * Pre-fills inclusions, Shifts and positive ShiftRequirements from the Usual
 * setup, inside the caller's transaction. Send uses it for a whole Cycle;
 * Apply on an already-Sent Cycle uses it for the blocks it adds.
 */
export class UsualSetupStaffingSeeder implements IUsualSetupStaffingSeeder {
  private readonly profileSeeder: IProfileSeeder;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly shiftRepository: ShiftRepository;
  private readonly usualSetupRepository: UsualSetupRepository;
  private readonly ministryRepository: MinistryRepository;

  constructor({
    participationRepository,
    shiftRepository,
    usualSetupRepository,
    ministryRepository,
    profileSeeder,
  }: UsualSetupStaffingSeederDependencies) {
    this.profileSeeder = profileSeeder;
    this.participationRepository = participationRepository;
    this.shiftRepository = shiftRepository;
    this.usualSetupRepository = usualSetupRepository;
    this.ministryRepository = ministryRepository;
  }

  async loadSetup({
    churchId,
    timeZone,
    tx,
  }: LoadUsualSetupSeedContextInput): Promise<UsualSetupSeedContext> {
    // Sequential: concurrent queries on one transaction connection warn in pg.
    const entries = await this.usualSetupRepository.listByChurch({
      churchId,
      tx,
    });
    const ministries = await this.ministryRepository.listByChurch({
      churchId,
      tx,
    });

    const entriesByMinistry = new Map<MinistryId, ProfileSeederEntry[]>();
    for (const entry of entries) {
      const ministryEntries = entriesByMinistry.get(entry.ministryId) ?? [];
      ministryEntries.push({
        sourceTemplateTimeBlockId: entry.sourceTemplateTimeBlockId,
        serves: entry.serves,
        shiftSplit: entry.shiftSplit,
        headcounts: entry.headcounts,
      });
      entriesByMinistry.set(entry.ministryId, ministryEntries);
    }

    return {
      entriesByMinistry,
      directionByMinistry: new Map(
        ministries.map((ministry) => [ministry.id, ministry.defaultDirection]),
      ),
      globalDefaultAllIn: false,
      timeZone,
    };
  }

  /**
   * The distinct active Ministries `seed` would include in at least one block,
   * planned from the same policy without writing anything.
   */
  async plannedMinistryIds(input: SeedStaffingInput): Promise<Set<MinistryId>> {
    const ministryIds = new Set<MinistryId>();
    for await (const { participation } of this.includedPlans(input)) {
      ministryIds.add(participation.ministryId);
    }
    return ministryIds;
  }

  async seed(input: SeedStaffingInput): Promise<void> {
    const { churchId, tx } = input;
    for await (const included of this.includedPlans(input)) {
      await this.writePlan({ ...included, churchId, tx });
    }
  }

  /** Seeds one block of one participation; false when the setup policy excludes it. */
  async seedParticipationBlock({
    churchId,
    participation,
    block,
    setup,
    tx,
  }: SeedParticipationBlockInput): Promise<boolean> {
    const plan = this.planFor({ participation, block, setup });
    if (!plan?.include) return false;
    await this.writePlan({ churchId, participation, block, plan, tx });
    return true;
  }

  private async writePlan({
    churchId,
    block,
    participation,
    plan,
    tx,
  }: WritePlanInput): Promise<void> {
    await this.participationRepository.addInclusion({
      churchId,
      participationId: participation.id,
      eventTimeBlockId: block.eventTimeBlockId,
      tx,
    });

    const shifts = plan.shifts.map(
      (shiftPlan) =>
        new Shift({
          props: {
            churchId,
            participationId: participation.id,
            eventTimeBlockId: block.eventTimeBlockId,
            startTime: shiftPlan.startTime,
            endTime: shiftPlan.endTime,
            label: shiftPlan.label,
          },
          eventTimeBlockBounds: block,
        }),
    );
    await this.shiftRepository.createMany({ churchId, shifts, tx });

    for (const [index, shiftPlan] of plan.shifts.entries()) {
      const shift = shifts[index];
      if (!shift) continue;
      for (const headcount of shiftPlan.headcounts) {
        await this.shiftRepository.saveRequirement({
          churchId,
          shiftId: shift.id,
          participationId: participation.id,
          sectorId: headcount.sectorId,
          roleId: headcount.roleId,
          peopleNeeded: headcount.peopleNeeded,
          tx,
        });
      }
    }
  }

  private planFor({
    participation,
    block,
    setup,
  }: PlanForInput): ParticipationSeedPlan | undefined {
    const direction = setup.directionByMinistry.get(participation.ministryId);
    if (!direction) return undefined;

    return this.profileSeeder.plan({
      eventTimeBlock: block,
      profileEntries:
        setup.entriesByMinistry.get(participation.ministryId) ?? [],
      ministryDefaultDirection: direction,
      globalDefaultAllIn: setup.globalDefaultAllIn,
      timeZone: setup.timeZone,
    });
  }

  /** Each (block, active Ministry participation) the setup policy includes. */
  private async *includedPlans({
    churchId,
    eventTimeBlocks,
    setup,
    tx,
  }: SeedStaffingInput): AsyncGenerator<IncludedPlan> {
    const blocksByEvent = new Map<EventId, StaffingSeedEventTimeBlock[]>();
    for (const block of eventTimeBlocks) {
      const blocks = blocksByEvent.get(block.eventId) ?? [];
      blocks.push(block);
      blocksByEvent.set(block.eventId, blocks);
    }

    for (const blocks of blocksByEvent.values()) {
      const [first] = blocks;
      if (!first) continue;
      const participations = await this.participationRepository.listByEvent({
        churchId,
        eventId: first.eventId,
        tx,
      });

      for (const block of blocks) {
        for (const participation of participations) {
          const plan = this.planFor({ participation, block, setup });
          if (plan?.include) yield { block, participation, plan };
        }
      }
    }
  }
}
