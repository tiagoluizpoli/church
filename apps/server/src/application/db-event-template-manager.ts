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
import {
  EventTemplate,
  type EventTemplateUsage,
} from '../domain/entities/event-template';

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
 * Text arrives trimmed by the API schema.
 */
function normalizeBlocks({
  blocks,
}: NormalizeBlocksInput): EventTemplateTimeBlockInput[] {
  EventTemplate.assertBlocks({ blocks });
  return blocks
    .map(({ id, label, startTime, endTime }) => {
      const normalizedId = id?.toLowerCase();
      return {
        ...(normalizedId ? { id: TemplateTimeBlockId.from(normalizedId) } : {}),
        label,
        startTime,
        endTime,
      };
    })
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
        name: input.name,
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
        name: input.name,
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
