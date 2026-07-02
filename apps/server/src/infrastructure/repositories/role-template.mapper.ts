import type {
  ChurchId,
  MinistryId,
  RoleId,
  RoleTemplateId,
} from '../../domain/branded-ids';
import type {
  RoleTemplateItemId,
  RoleTemplateItemProps,
  RoleTemplateProps,
} from '../../domain/entities/role-template';
import {
  RoleTemplate,
  RoleTemplateItem,
} from '../../domain/entities/role-template';

export function mapRoleTemplateItem(row: {
  id: string;
  churchId: string;
  templateId: string;
  roleId: string;
  requiredCount: number;
}): RoleTemplateItem {
  const props: RoleTemplateItemProps = {
    churchId: row.churchId as ChurchId,
    templateId: row.templateId as RoleTemplateId,
    roleId: row.roleId as RoleId,
    requiredCount: row.requiredCount,
  };

  return new RoleTemplateItem(props, row.id as RoleTemplateItemId);
}

export function mapRoleTemplate(
  row: {
    id: string;
    churchId: string;
    ministryId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  },
  items: RoleTemplateItem[] = [],
): RoleTemplate {
  const props: RoleTemplateProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as MinistryId,
    name: row.name,
    items,
  };

  return new RoleTemplate(
    props,
    row.id as RoleTemplateId,
    row.createdAt,
    row.updatedAt,
  );
}
