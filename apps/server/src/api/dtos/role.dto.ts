import { z } from 'zod';
import type { RoleTemplate } from '../../domain/entities/role-template';

export const upsertRoleTemplateBodySchema = z.object({
  ministryId: z.string(),
  name: z.string().min(1),
  items: z.array(
    z.object({
      roleId: z.string(),
      requiredCount: z.number().int().min(1),
    }),
  ),
});

export const roleTemplateItemResponseSchema = z.object({
  id: z.string(),
  roleId: z.string(),
  requiredCount: z.number(),
});

export const roleTemplateResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  ministryId: z.string(),
  name: z.string(),
  items: z.array(roleTemplateItemResponseSchema),
});
export type RoleTemplateResponse = z.infer<typeof roleTemplateResponseSchema>;

export const roleTemplateListResponseSchema = z.object({
  items: z.array(roleTemplateResponseSchema),
});

function toRoleTemplateResponse(t: RoleTemplate): RoleTemplateResponse {
  return {
    id: t.id as string,
    churchId: t.churchId as string,
    ministryId: t.ministryId as string,
    name: t.name,
    items: t.items.map((item) => ({
      id: item.id as string,
      roleId: item.roleId as string,
      requiredCount: item.requiredCount,
    })),
  };
}

export const roleTemplateMapper = {
  toResponse: toRoleTemplateResponse,
  listToResponse(templates: RoleTemplate[]) {
    return { items: templates.map(toRoleTemplateResponse) };
  },
};
