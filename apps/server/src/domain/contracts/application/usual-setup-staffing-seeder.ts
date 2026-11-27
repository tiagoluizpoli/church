import type { Instant } from '@church/time';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  TemplateTimeBlockId,
} from '../../branded-ids';
import type { DefaultDirection } from '../../entities/ministry';
import type { MinistryParticipation } from '../../entities/ministry-participation';
import type {
  ParticipationSeedPlan,
  ProfileSeederEntry,
} from '../../services/church-identity/profile-seeder.types';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UsualSetupRepository } from '@/domain/contracts/infrastructure/usual-setup.repository';

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

export interface SeedParticipationBlockInput {
  churchId: ChurchId;
  participation: MinistryParticipation;
  block: StaffingSeedEventTimeBlock;
  setup: UsualSetupSeedContext;
  tx: TransactionContext;
}

export interface PlanForInput {
  participation: MinistryParticipation;
  block: StaffingSeedEventTimeBlock;
  setup: UsualSetupSeedContext;
}

export interface WritePlanInput extends IncludedPlan {
  churchId: ChurchId;
  tx: TransactionContext;
}

export interface IncludedPlan {
  block: StaffingSeedEventTimeBlock;
  participation: MinistryParticipation;
  plan: ParticipationSeedPlan;
}

export interface UsualSetupStaffingSeederDependencies {
  participationRepository: MinistryParticipationRepository;
  shiftRepository: ShiftRepository;
  usualSetupRepository: UsualSetupRepository;
  ministryRepository: MinistryRepository;
}

/**
 * Pre-fills inclusions, Shifts and positive ShiftRequirements from the Usual
 * setup, inside the caller's transaction.
 */
export interface IUsualSetupStaffingSeeder {
  loadSetup(
    input: LoadUsualSetupSeedContextInput,
  ): Promise<UsualSetupSeedContext>;
  plannedMinistryIds(input: SeedStaffingInput): Promise<Set<MinistryId>>;
  seed(input: SeedStaffingInput): Promise<void>;
  /** Seeds one block of one participation; false when the setup policy excludes it. */
  seedParticipationBlock(input: SeedParticipationBlockInput): Promise<boolean>;
}
