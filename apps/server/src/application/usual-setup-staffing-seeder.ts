import type { Instant } from '@church/time';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  TemplateTimeBlockId,
} from '../domain/branded-ids';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UsualSetupRepository } from '../domain/contracts/infrastructure/usual-setup.repository';
import type { DefaultDirection } from '../domain/entities/ministry';
import { Shift } from '../domain/entities/shift';
import {
  ProfileSeeder,
  type ProfileSeederEntry,
} from '../domain/services/profile-seeder';

/** The Church's Usual setup as read inside the seeding transaction. */
export interface UsualSetupSeedContext {
  entriesByMinistry: Map<MinistryId, ProfileSeederEntry[]>;
  /** Active Ministries only; a Ministry absent here is never seeded. */
  directionByMinistry: Map<MinistryId, DefaultDirection>;
  globalDefaultAllIn: boolean;
  timeZone: string;
}

/** An actual EventTimeBlock copy; its bounds are never changed by seeding. */
export interface StaffingSeedEventTimeBlock {
  eventId: EventId;
  eventTimeBlockId: EventTimeBlockId;
  sourceTemplateTimeBlockId?: TemplateTimeBlockId;
  startTime: Instant;
  endTime: Instant;
}

export interface LoadUsualSetupSeedContextInput {
  churchId: ChurchId;
  timeZone: string;
  tx: TransactionContext;
}

export interface SeedStaffingInput {
  churchId: ChurchId;
  eventTimeBlocks: StaffingSeedEventTimeBlock[];
  setup: UsualSetupSeedContext;
  tx: TransactionContext;
}

interface UsualSetupStaffingSeederDependencies {
  participationRepository: MinistryParticipationRepository;
  shiftRepository: ShiftRepository;
  usualSetupRepository: UsualSetupRepository;
  ministryRepository: MinistryRepository;
}

/**
 * Pre-fills inclusions, Shifts and positive ShiftRequirements from the Usual
 * setup, inside the caller's transaction. Send uses it for a whole Cycle;
 * Apply on an already-Sent Cycle uses it for the blocks it adds.
 */
export class UsualSetupStaffingSeeder {
  private readonly profileSeeder = new ProfileSeeder();
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly shiftRepository: ShiftRepository;
  private readonly usualSetupRepository: UsualSetupRepository;
  private readonly ministryRepository: MinistryRepository;

  constructor({
    participationRepository,
    shiftRepository,
    usualSetupRepository,
    ministryRepository,
  }: UsualSetupStaffingSeederDependencies) {
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

  async seed({
    churchId,
    eventTimeBlocks,
    setup,
    tx,
  }: SeedStaffingInput): Promise<void> {
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
          const ministryId = participation.ministryId;
          const direction = setup.directionByMinistry.get(ministryId);
          if (!direction) continue;

          const plan = this.profileSeeder.plan({
            eventTimeBlock: block,
            profileEntries: setup.entriesByMinistry.get(ministryId) ?? [],
            ministryDefaultDirection: direction,
            globalDefaultAllIn: setup.globalDefaultAllIn,
            timeZone: setup.timeZone,
          });
          if (!plan.include) continue;

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
              await this.shiftRepository.upsertRequirement({
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
      }
    }
  }
}
