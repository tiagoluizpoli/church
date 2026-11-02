import { fromDate, instantSchema } from '@church/time';
import { z } from 'zod';
import type { Ministry } from '../../domain/entities/ministry';

/** The single trim point for Ministry names; uniqueness is the database's. */
export const ministryNameBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
});

export type MinistryNameBody = z.infer<typeof ministryNameBodySchema>;

export const ministryResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  defaultDirection: z.enum(['all_in', 'all_out']),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export type MinistryResponse = z.infer<typeof ministryResponseSchema>;

export const ministryListResponseSchema = z.object({
  ministries: z.array(ministryResponseSchema),
});

export type MinistryListResponse = z.infer<typeof ministryListResponseSchema>;

export const cycleArchiveBlockerSchema = z.object({
  kind: z.literal('cycle'),
  ministryId: z.string().uuid(),
  ministryName: z.string(),
  cycleId: z.string().uuid(),
  cycleName: z.string(),
});

/** 409 archive refusal: the error envelope plus where the item is still used. */
export const archiveBlockedResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  blockers: z.array(z.discriminatedUnion('kind', [cycleArchiveBlockerSchema])),
});

export const ministryMapper = {
  toResponse(ministry: Ministry): MinistryResponse {
    return {
      id: ministry.id,
      churchId: ministry.churchId,
      name: ministry.name,
      description: ministry.description,
      defaultDirection: ministry.defaultDirection,
      createdAt: fromDate({ date: ministry.createdAt }),
      updatedAt: fromDate({ date: ministry.updatedAt }),
    };
  },

  toResponseList(ministries: Ministry[]): MinistryListResponse {
    return { ministries: ministries.map((m) => ministryMapper.toResponse(m)) };
  },
};
