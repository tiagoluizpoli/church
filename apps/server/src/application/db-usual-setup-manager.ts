import { NotFoundError } from '@church/core';
import type { IParticipationReader } from '../domain/contracts/application/participation-reader';
import type {
  DbUsualSetupManagerDependencies,
  IUsualSetupManager,
  ListUsualSetupBlocksInput,
  SaveUsualSetupBlockInput,
  ToUsualSetupBlockViewInput,
  UsualSetupBlockView,
} from '../domain/contracts/application/usual-setup-manager';
import type { EventTemplateRepository } from '../domain/contracts/infrastructure/event-template.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { UsualSetupRepository } from '../domain/contracts/infrastructure/usual-setup.repository';
import {
  assertManualSplitFitsBlock,
  assertValidUsualSetupProps,
  toSaveableUsualSetupEntry,
} from '../domain/entities/usual-setup';
import { usualSetupNeedsReview } from '../domain/services/scheduling/usual-setup-planner';

function toUsualSetupBlockView({
  template,
  block,
  entry,
}: ToUsualSetupBlockViewInput): UsualSetupBlockView {
  return {
    templateId: template.id,
    templateName: template.name,
    weekday:
      template.recurrence.kind === 'weekly' &&
      template.recurrence.weekdays.length === 1
        ? (template.recurrence.weekdays[0] ?? null)
        : null,
    sourceTemplateTimeBlockId: block.id,
    label: block.label,
    startTime: block.startTime,
    endTime: block.endTime,
    order: block.order,
    entry,
    // Derived on every read from the serving manual split vs current bounds.
    needsReview: usualSetupNeedsReview({ entry, block }),
  };
}

export class DbUsualSetupManager implements IUsualSetupManager {
  private readonly eventTemplateRepository: EventTemplateRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly usualSetupRepository: UsualSetupRepository;
  private readonly participationReader: IParticipationReader;

  constructor({
    eventTemplateRepository,
    ministryRepository,
    unitOfWork,
    usualSetupRepository,
    participationReader,
  }: DbUsualSetupManagerDependencies) {
    this.eventTemplateRepository = eventTemplateRepository;
    this.ministryRepository = ministryRepository;
    this.unitOfWork = unitOfWork;
    this.usualSetupRepository = usualSetupRepository;
    this.participationReader = participationReader;
  }

  async listUsualSetupBlocks({
    churchId,
    ministryId,
  }: ListUsualSetupBlocksInput): Promise<UsualSetupBlockView[]> {
    const [templates, entries] = await Promise.all([
      this.eventTemplateRepository.list({ churchId }),
      this.usualSetupRepository.listByMinistry({ churchId, ministryId }),
    ]);
    const entriesByBlock = new Map(
      entries.map((entry) => [entry.sourceTemplateTimeBlockId, entry]),
    );
    const byName = [...templates].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    return byName.flatMap((template) =>
      template.blocks.map((block) =>
        toUsualSetupBlockView({
          template,
          block,
          entry: entriesByBlock.get(block.id),
        }),
      ),
    );
  }

  async saveUsualSetupBlock({
    churchId,
    ministryId,
    entry,
  }: SaveUsualSetupBlockInput): Promise<UsualSetupBlockView> {
    const saveable = toSaveableUsualSetupEntry({ entry });
    // The entity's own rules (split shape, positive counts, unique places).
    assertValidUsualSetupProps(saveable);

    return this.unitOfWork.run(async (tx) => {
      // Saving a setup is new use: refused for an archived Ministry.
      await this.ministryRepository.lockActive({
        churchId,
        ministryId,
        strength: 'share',
        tx,
      });
      // Any same-Church block is valid; another Church's is indistinguishable from a missing one.
      const templates = await this.eventTemplateRepository.list({
        churchId,
        tx,
      });
      const located = templates.flatMap((template) =>
        template.blocks
          .filter((block) => block.id === saveable.sourceTemplateTimeBlockId)
          .map((block) => ({ template, block })),
      );
      const [target] = located;
      if (!target) {
        throw new NotFoundError(
          `Template time block not found: ${saveable.sourceTemplateTimeBlockId}`,
        );
      }
      assertManualSplitFitsBlock({
        shiftSplit: saveable.shiftSplit,
        blockStartTime: target.block.startTime,
        blockEndTime: target.block.endTime,
      });
      await this.participationReader.assertMinistryHeadcounts({
        churchId,
        ministryId,
        headcounts: saveable.headcounts,
        tx,
      });
      const saved = await this.usualSetupRepository.upsertBlock({
        churchId,
        ministryId,
        entry: saveable,
        tx,
      });
      return toUsualSetupBlockView({ ...target, entry: saved });
    });
  }
}
