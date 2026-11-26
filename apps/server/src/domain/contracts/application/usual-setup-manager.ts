import type { TimeOfDay } from '@church/time';
import type {
  ChurchId,
  EventTemplateId,
  MinistryId,
  TemplateTimeBlockId,
} from '../../branded-ids';
import type { EventTemplate } from '../../entities/event-template';
import type { TemplateTimeBlock } from '../../entities/template-time-block';
import type {
  UsualSetup,
  UsualSetupEntryInput,
} from '../../entities/usual-setup';
import type { IParticipationReader } from './participation-reader';
import type { EventTemplateRepository } from '@/domain/contracts/infrastructure/event-template.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { UsualSetupRepository } from '@/domain/contracts/infrastructure/usual-setup.repository';

export interface ListUsualSetupBlocksInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

export interface SaveUsualSetupBlockInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  entry: UsualSetupEntryInput;
}

/** A current TemplateTimeBlock with the Ministry's saved entry for it, if any. */
export interface UsualSetupBlockView {
  templateId: EventTemplateId;
  templateName: string;
  /** The weekday of a template weekly on exactly one weekday; otherwise null. */
  weekday: number | null;
  sourceTemplateTimeBlockId: TemplateTimeBlockId;
  label: string;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  order: number;
  entry?: UsualSetup;
  /** Derived, never stored: a serving manual split no longer fits the block. */
  needsReview: boolean;
}

export interface ToUsualSetupBlockViewInput {
  template: EventTemplate;
  block: TemplateTimeBlock;
  entry: UsualSetup | undefined;
}

export interface DbUsualSetupManagerDependencies {
  eventTemplateRepository: EventTemplateRepository;
  ministryRepository: MinistryRepository;
  unitOfWork: UnitOfWork;
  usualSetupRepository: UsualSetupRepository;
  participationReader: IParticipationReader;
}

export interface IUsualSetupManager {
  /** Every current block by template name and block order, saved or not. */
  listUsualSetupBlocks(
    input: ListUsualSetupBlocksInput,
  ): Promise<UsualSetupBlockView[]>;
  /** Saves one block's entry, leaving the Ministry's other blocks untouched. */
  saveUsualSetupBlock(
    input: SaveUsualSetupBlockInput,
  ): Promise<UsualSetupBlockView>;
}
