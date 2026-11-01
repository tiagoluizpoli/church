import { TemplateTimeBlockId } from '../domain/branded-ids';
import type {
  CreateEventTemplateManagerInput,
  DeleteEventTemplateManagerInput,
  EventTemplateTimeBlockManagerInput,
  GetEventTemplateManagerInput,
  IEventTemplateManager,
  ListEventTemplatesManagerInput,
  UpdateEventTemplateManagerInput,
} from '../domain/contracts/application/event-template-manager';
import type {
  EventTemplateRepository,
  EventTemplateTimeBlockInput,
} from '../domain/contracts/infrastructure/event-template.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type {
  EventTemplate,
  EventTemplateUsage,
} from '../domain/entities/event-template';
import { DuplicateTemplateBlockLabelError } from '../domain/errors/duplicate-template-name';
import { InvalidTimeRangeError } from '../domain/errors/invalid-time-range';

interface DbEventTemplateManagerDependencies {
  templateRepository: EventTemplateRepository;
  unitOfWork: UnitOfWork;
}

interface NormalizeBlocksInput {
  blocks: EventTemplateTimeBlockManagerInput[];
}

/**
 * Validates the desired blocks and derives contiguous zero-based `order` by
 * ascending start time; equal starts keep their submitted relative order.
 */
function normalizeBlocks({
  blocks,
}: NormalizeBlocksInput): EventTemplateTimeBlockInput[] {
  const labels = new Set<string>();
  for (const block of blocks) {
    if (block.startTime === block.endTime) {
      throw new InvalidTimeRangeError('Start time must not equal end time');
    }
    const key = block.label.trim().toLowerCase();
    if (labels.has(key)) {
      throw new DuplicateTemplateBlockLabelError();
    }
    labels.add(key);
  }
  return blocks
    .map(({ id, label, startTime, endTime }) => ({
      ...(id ? { id: TemplateTimeBlockId.from(id.toLowerCase()) } : {}),
      label: label.trim(),
      startTime,
      endTime,
    }))
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
    .map((block, order) => ({ ...block, order }));
}

export class DbEventTemplateManager implements IEventTemplateManager {
  private readonly templateRepository: EventTemplateRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    templateRepository,
    unitOfWork,
  }: DbEventTemplateManagerDependencies) {
    this.templateRepository = templateRepository;
    this.unitOfWork = unitOfWork;
  }

  async createTemplate(
    input: CreateEventTemplateManagerInput,
  ): Promise<EventTemplate> {
    const blocks = normalizeBlocks({ blocks: input.blocks });
    return this.unitOfWork.run((tx) =>
      this.templateRepository.create({
        churchId: input.churchId,
        name: input.name.trim(),
        weekday: input.weekday,
        blocks,
        tx,
      }),
    );
  }

  async updateTemplate(
    input: UpdateEventTemplateManagerInput,
  ): Promise<EventTemplate> {
    const blocks = normalizeBlocks({ blocks: input.blocks });
    return this.unitOfWork.run((tx) =>
      this.templateRepository.update({
        churchId: input.churchId,
        templateId: input.templateId,
        name: input.name.trim(),
        weekday: input.weekday,
        blocks,
        tx,
      }),
    );
  }

  async deleteTemplate(input: DeleteEventTemplateManagerInput): Promise<void> {
    await this.templateRepository.delete(input);
  }

  async getTemplate(
    input: GetEventTemplateManagerInput,
  ): Promise<EventTemplate> {
    return this.templateRepository.getById(input);
  }

  async getTemplateUsage(
    input: GetEventTemplateManagerInput,
  ): Promise<EventTemplateUsage> {
    return this.templateRepository.getUsage(input);
  }

  async listTemplates(
    input: ListEventTemplatesManagerInput,
  ): Promise<EventTemplate[]> {
    return this.templateRepository.list(input);
  }
}
