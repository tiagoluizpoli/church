import type { roleTemplate, roleTemplateItem } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId } from '../../domain/entities/church';
import type { MinistryId } from '../../domain/entities/ministry';
import type { RoleId } from '../../domain/entities/role';
import type {
  RoleTemplateId,
  RoleTemplateItemId,
  RoleTemplateItemProps,
  RoleTemplateProps,
} from '../../domain/entities/role-template';
import {
  RoleTemplate,
  RoleTemplateItem,
} from '../../domain/entities/role-template';

type RoleTemplateRow = InferSelectModel<typeof roleTemplate>;
type RoleTemplateItemRow = InferSelectModel<typeof roleTemplateItem>;

export function mapRoleTemplateItem(
  row: RoleTemplateItemRow,
): RoleTemplateItem {
  const props: RoleTemplateItemProps = {
    churchId: row.churchId as ChurchId,
    templateId: row.templateId as RoleTemplateId,
    roleId: row.roleId as RoleId,
    requiredCount: row.requiredCount,
  };

  return new RoleTemplateItem(props, row.id as RoleTemplateItemId);
}

export function mapRoleTemplate(
  row: RoleTemplateRow,
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
