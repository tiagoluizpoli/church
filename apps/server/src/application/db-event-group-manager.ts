import { NotFoundError } from '@church/core';
import type {
  DbEventGroupManagerDependencies,
  EventGroupsView,
  IEventGroupManager,
  ReadEventGroupsInput,
  SaveEventGroupsInput,
} from '../domain/contracts/application/event-group-manager';
import type { EventGroupRepository } from '../domain/contracts/infrastructure/event-group.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';

/** A Ministry's Event groups (#1247): read and saved as one ordered list. */
export class DbEventGroupManager implements IEventGroupManager {
  private readonly eventGroupRepository: EventGroupRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    eventGroupRepository,
    unitOfWork,
  }: DbEventGroupManagerDependencies) {
    this.eventGroupRepository = eventGroupRepository;
    this.unitOfWork = unitOfWork;
  }

  async read(input: ReadEventGroupsInput): Promise<EventGroupsView> {
    return this.unitOfWork.run(async (tx) => {
      const setup = await this.eventGroupRepository.findSetup({ ...input, tx });
      const templates = await this.eventGroupRepository.listChurchTemplates({
        churchId: input.churchId,
        tx,
      });
      return { ...setup, templates };
    });
  }

  async save(input: SaveEventGroupsInput): Promise<EventGroupsView> {
    await this.unitOfWork.run(async (tx) => {
      const templates = await this.eventGroupRepository.listChurchTemplates({
        churchId: input.churchId,
        tx,
      });
      const known = new Set(templates.map((template) => template.id));
      const saved = input.groups.flatMap((group) => group.templateIds);
      if (saved.some((templateId) => !known.has(templateId))) {
        throw new NotFoundError('EventTemplate');
      }
      await this.eventGroupRepository.replaceSetup({ ...input, tx });
    });
    return this.read(input);
  }
}
