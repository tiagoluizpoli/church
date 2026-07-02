import type {
  ChurchId,
  EventId,
  MinistryId,
  RoleId,
  RoleTemplateId,
} from '../../branded-ids';
import type { RoleTemplate } from '../../entities/role-template';

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
