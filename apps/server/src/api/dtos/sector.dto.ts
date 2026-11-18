import { z } from 'zod';
import type { Sector } from '../../domain/entities/sector';

/** The single trim point for Sector names; uniqueness is the database's. */
export const sectorNameBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
});

export type SectorNameBody = z.infer<typeof sectorNameBodySchema>;

export const sectorResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type SectorResponse = z.infer<typeof sectorResponseSchema>;

export const sectorListResponseSchema = z.object({
  sectors: z.array(sectorResponseSchema),
});

export type SectorListResponse = z.infer<typeof sectorListResponseSchema>;

export const sectorMapper = {
  toResponse(sector: Sector): SectorResponse {
    return { id: sector.id, name: sector.name };
  },

  toResponseList(sectors: Sector[]): SectorListResponse {
    return { sectors: sectors.map((s) => sectorMapper.toResponse(s)) };
  },
};
