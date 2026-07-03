import { z } from 'zod';
import type { Ministry } from '../../domain/entities/ministry';

export const ministryResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enforcementType: z.enum(['soft', 'hard']),
  defaultDirection: z.enum(['all_in', 'all_out']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MinistryResponse = z.infer<typeof ministryResponseSchema>;

export const ministryListResponseSchema = z.object({
  ministries: z.array(ministryResponseSchema),
});

export const ministryMapper = {
  toResponse(ministry: Ministry): MinistryResponse {
    return {
      id: ministry.id,
      churchId: ministry.churchId,
      name: ministry.name,
      description: ministry.description,
      enforcementType: ministry.enforcementType,
      defaultDirection: ministry.defaultDirection,
      createdAt: ministry.createdAt.toISOString(),
      updatedAt: ministry.updatedAt.toISOString(),
    };
  },

  toResponseList(ministries: Ministry[]): { ministries: MinistryResponse[] } {
    return { ministries: ministries.map((m) => ministryMapper.toResponse(m)) };
  },
};
