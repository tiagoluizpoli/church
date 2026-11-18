import { z } from 'zod';
import type { Role } from '../../domain/entities/role';

/** The single trim point for Role names; uniqueness is the database's. */
export const roleNameBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
});

export type RoleNameBody = z.infer<typeof roleNameBodySchema>;

export const roleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type RoleResponse = z.infer<typeof roleResponseSchema>;

export const roleListResponseSchema = z.object({
  roles: z.array(roleResponseSchema),
});

export type RoleListResponse = z.infer<typeof roleListResponseSchema>;

export const roleMapper = {
  toResponse(role: Role): RoleResponse {
    return { id: role.id, name: role.name };
  },

  toResponseList(roles: Role[]): RoleListResponse {
    return { roles: roles.map((role) => roleMapper.toResponse(role)) };
  },
};
