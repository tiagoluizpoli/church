import { fromDate, instantSchema } from '@church/time';
import { z } from 'zod';
import type { MinistryId } from '../../domain/branded-ids';
import type {
  MinistryPage,
  MinistrySummary,
} from '../../domain/contracts/application/ministry-manager';
import {
  MINISTRY_LIST_STATUS_OPTIONS,
  type Ministry,
} from '../../domain/entities/ministry';
import { decodeMinistryListCursor } from '../../domain/ministry-list-cursor';

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

export const ministryListItemResponseSchema = ministryResponseSchema.extend({
  sectorCount: z.number().int().nonnegative(),
  roleCount: z.number().int().nonnegative(),
  needsReview: z.boolean(),
});

export type MinistryListItemResponse = z.infer<
  typeof ministryListItemResponseSchema
>;

export const ministryListResponseSchema = z.object({
  ministries: z.array(ministryListItemResponseSchema),
});

export type MinistryListResponse = z.infer<typeof ministryListResponseSchema>;

export const ministryPageQuerystringSchema = z.object({
  search: z.string().trim().min(1).max(255).optional(),
  status: z.enum(MINISTRY_LIST_STATUS_OPTIONS).default('any'),
  cursor: z
    .string()
    .refine(
      (cursor) =>
        z.string().uuid().safeParse(decodeMinistryListCursor({ cursor })?.id)
          .success,
      { message: 'Invalid cursor' },
    )
    .optional(),
});

export const ministryPageResponseSchema = ministryListResponseSchema.extend({
  nextCursor: z.string().optional(),
  /** Ministries in the caller's whole scope, ignoring the filters and the cursor. */
  counts: z.object({
    total: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    noSectors: z.number().int().nonnegative(),
  }),
});

export type MinistryPageResponse = z.infer<typeof ministryPageResponseSchema>;

interface MinistryListMapperInput {
  ministries: Ministry[];
  summaries: Map<MinistryId, MinistrySummary>;
}

const EMPTY_SUMMARY: MinistrySummary = {
  sectorCount: 0,
  roleCount: 0,
  needsReview: false,
};

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

  toResponseList({
    ministries,
    summaries,
  }: MinistryListMapperInput): MinistryListResponse {
    return {
      ministries: ministries.map((m) => ({
        ...ministryMapper.toResponse(m),
        ...(summaries.get(m.id) ?? EMPTY_SUMMARY),
      })),
    };
  },

  toPageResponse({
    ministries,
    summaries,
    nextCursor,
    counts,
  }: MinistryPage): MinistryPageResponse {
    return {
      ...ministryMapper.toResponseList({ ministries, summaries }),
      nextCursor,
      counts,
    };
  },
};
