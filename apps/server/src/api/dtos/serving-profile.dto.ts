import { z } from 'zod';
import type { MinistryServingProfile } from '../../domain/entities/ministry-serving-profile';

const servingProfileHeadcountSchema = z.object({
  roleId: z.string(),
  teamId: z.string().optional(),
  count: z.number().int().min(1),
});

const servingProfileShiftSplitSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('equal'),
    count: z.number().int().min(1),
  }),
  z.object({
    kind: z.literal('manual'),
    spans: z.array(
      z.object({
        label: z.string().optional(),
        startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      }),
    ),
  }),
]);

export const servingProfileEntrySchema = z.object({
  sourceTemplateBlockId: z.string(),
  serves: z.boolean(),
  shiftSplit: servingProfileShiftSplitSchema,
  headcounts: z.array(servingProfileHeadcountSchema),
});

export const upsertServingProfileBodySchema = z.object({
  entries: z.array(servingProfileEntrySchema),
});
export type UpsertServingProfileBody = z.infer<
  typeof upsertServingProfileBodySchema
>;

export const servingProfileEntryResponseSchema = z.object({
  id: z.string(),
  ministryId: z.string(),
  sourceTemplateBlockId: z.string(),
  serves: z.boolean(),
  shiftSplit: servingProfileShiftSplitSchema,
  headcounts: z.array(servingProfileHeadcountSchema),
});

export const servingProfileResponseSchema = z.object({
  entries: z.array(servingProfileEntryResponseSchema),
});
export type ServingProfileResponse = z.infer<
  typeof servingProfileResponseSchema
>;

export const setDefaultDirectionBodySchema = z.object({
  defaultDirection: z.enum(['all_in', 'all_out']),
});
export type SetDefaultDirectionBody = z.infer<
  typeof setDefaultDirectionBodySchema
>;

function toEntryResponse(profile: MinistryServingProfile) {
  return {
    id: profile.id as string,
    ministryId: profile.ministryId as string,
    sourceTemplateBlockId: profile.sourceTemplateBlockId as string,
    serves: profile.serves,
    shiftSplit: profile.shiftSplit,
    headcounts: profile.headcounts.map((headcount) => ({
      roleId: headcount.roleId as string,
      teamId: headcount.teamId as string | undefined,
      count: headcount.count,
    })),
  };
}

export const servingProfileMapper = {
  toResponse(profiles: MinistryServingProfile[]): ServingProfileResponse {
    return { entries: profiles.map(toEntryResponse) };
  },
};
