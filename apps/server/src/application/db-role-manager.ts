import 'reflect-metadata';
import { NotFoundError } from '@church/core';
import { inject, injectable } from 'tsyringe';
import type {
  ChurchId,
  EventId,
  MinistryId,
  RoleTemplateId,
} from '../domain/branded-ids';
import type {
  IRoleManager,
  UpsertRoleTemplateInput,
} from '../domain/contracts/application/role-manager';
import type { RoleTemplateRepository } from '../domain/contracts/infrastructure/role-template.repository';
import type { TimeSlotRepository } from '../domain/contracts/infrastructure/time-slot.repository';
import type { RoleTemplate } from '../domain/entities/role-template';

@injectable()
export class DbRoleManager implements IRoleManager {
  constructor(
    @inject('IRoleTemplateRepository')
    private readonly roleTemplateRepo: RoleTemplateRepository,
    @inject('ITimeSlotRepository')
    private readonly timeSlotRepo: TimeSlotRepository,
  ) {}

  async listTemplates(input: {
    churchId: ChurchId;
    ministryId: MinistryId;
  }): Promise<RoleTemplate[]> {
    return this.roleTemplateRepo.listByMinistry(
      input.churchId,
      input.ministryId,
    );
  }

  async upsertTemplate(input: UpsertRoleTemplateInput): Promise<RoleTemplate> {
    const { churchId, ministryId, templateId, name, items } = input;
    if (templateId) {
      try {
        await this.roleTemplateRepo.getById(churchId, templateId);
        return this.roleTemplateRepo.update(churchId, templateId, {
          name,
          items,
        });
      } catch (err) {
        if (!(err instanceof NotFoundError)) throw err;
      }
    }
    return this.roleTemplateRepo.create(churchId, { ministryId, name, items });
  }

  async applyTemplate(input: {
    eventId: EventId;
    templateId: string;
    churchId: ChurchId;
  }): Promise<void> {
    const { churchId, eventId, templateId } = input;
    const template = await this.roleTemplateRepo.getById(
      churchId,
      templateId as RoleTemplateId,
    );
    const slots = await this.timeSlotRepo.listByEvent(churchId, eventId);
    for (const slot of slots) {
      for (const item of template.items) {
        await this.timeSlotRepo.upsertRequirement(churchId, slot.id, {
          roleId: item.roleId,
          requiredCount: item.requiredCount,
        });
      }
    }
  }

  async deleteTemplate(input: {
    templateId: string;
    churchId: ChurchId;
  }): Promise<void> {
    await this.roleTemplateRepo.deleteById(
      input.churchId,
      input.templateId as RoleTemplateId,
    );
  }
}
