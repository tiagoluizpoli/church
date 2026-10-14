import type {
  CreateEventTemplateManagerInput,
  DeleteEventTemplateManagerInput,
  IEventTemplateManager,
  ListEventTemplatesManagerInput,
  UpdateEventTemplateManagerInput,
} from '../domain/contracts/application/event-template-manager';
import type { EventTemplateRepository } from '../domain/contracts/infrastructure/event-template.repository';
import type { EventTemplate } from '../domain/entities/event-template';

interface DbEventTemplateManagerDependencies {
  templateRepository: EventTemplateRepository;
}

export class DbEventTemplateManager implements IEventTemplateManager {
  private readonly templateRepository: EventTemplateRepository;

  constructor({ templateRepository }: DbEventTemplateManagerDependencies) {
    this.templateRepository = templateRepository;
  }

  async createTemplate(
    input: CreateEventTemplateManagerInput,
  ): Promise<EventTemplate> {
    return this.templateRepository.create(input);
  }

  async updateTemplate(
    input: UpdateEventTemplateManagerInput,
  ): Promise<EventTemplate> {
    return this.templateRepository.update(input);
  }

  async deleteTemplate(input: DeleteEventTemplateManagerInput): Promise<void> {
    await this.templateRepository.delete(input);
  }

  async listTemplates(
    input: ListEventTemplatesManagerInput,
  ): Promise<EventTemplate[]> {
    return this.templateRepository.list(input);
  }
}
