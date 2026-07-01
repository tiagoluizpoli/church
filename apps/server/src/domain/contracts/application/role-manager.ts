import type { ChurchId } from '../../entities/church';
import type { EventId } from '../../entities/event';
import type { MinistryId } from '../../entities/ministry';
import type { RoleId } from '../../entities/role';
import type {
  RoleTemplate,
  RoleTemplateId,
} from '../../entities/role-template';

export interface UpsertRoleTemplateInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  templateId?: RoleTemplateId;
  name: string;
  items: Array<{ roleId: RoleId; requiredCount: number }>;
}

export interface IRoleManager {
  listTemplates(input: {
    churchId: ChurchId;
    ministryId: MinistryId;
  }): Promise<RoleTemplate[]>;
  upsertTemplate(input: UpsertRoleTemplateInput): Promise<RoleTemplate>;
  applyTemplate(input: {
    eventId: EventId;
    templateId: string;
    churchId: ChurchId;
  }): Promise<void>;
  deleteTemplate(input: {
    templateId: string;
    churchId: ChurchId;
  }): Promise<void>;
}
