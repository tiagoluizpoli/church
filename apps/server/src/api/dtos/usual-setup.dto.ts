import { timeOfDaySchema } from '@church/time';
import { z } from 'zod';
import type { UsualSetup } from '../../domain/entities/usual-setup';

const usualSetupHeadcountSchema = z.object({
  sectorId: z.string(),
  roleId: z.string(),
  peopleNeeded: z.number().int().min(1),
});

const usualSetupShiftSplitSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('equal'),
    count: z.number().int().min(1),
  }),
  z.object({
    kind: z.literal('manual'),
    spans: z.array(
      z.object({
        label: z.string().optional(),
        startTime: timeOfDaySchema,
        endTime: timeOfDaySchema,
      }),
    ),
  }),
]);

export const usualSetupEntrySchema = z.object({
  sourceTemplateTimeBlockId: z.string(),
  serves: z.boolean(),
  shiftSplit: usualSetupShiftSplitSchema,
  headcounts: z.array(usualSetupHeadcountSchema),
});

export const upsertUsualSetupBodySchema = z.object({
  entries: z.array(usualSetupEntrySchema),
});
export type UpsertUsualSetupBody = z.infer<typeof upsertUsualSetupBodySchema>;

export const usualSetupEntryResponseSchema = z.object({
  id: z.string(),
  ministryId: z.string(),
  sourceTemplateTimeBlockId: z.string(),
  serves: z.boolean(),
  shiftSplit: usualSetupShiftSplitSchema,
  headcounts: z.array(usualSetupHeadcountSchema),
});

export const usualSetupResponseSchema = z.object({
  entries: z.array(usualSetupEntryResponseSchema),
});
export type UsualSetupResponse = z.infer<typeof usualSetupResponseSchema>;

export const setDefaultDirectionBodySchema = z.object({
  defaultDirection: z.enum(['all_in', 'all_out']),
});
export type SetDefaultDirectionBody = z.infer<
  typeof setDefaultDirectionBodySchema
>;

function toEntryResponse(profile: UsualSetup) {
  return {
    id: profile.id as string,
    ministryId: profile.ministryId as string,
    sourceTemplateTimeBlockId: profile.sourceTemplateTimeBlockId as string,
    serves: profile.serves,
    shiftSplit: profile.shiftSplit,
    headcounts: profile.headcounts.map((headcount) => ({
      sectorId: headcount.sectorId as string,
      roleId: headcount.roleId as string,
      peopleNeeded: headcount.peopleNeeded,
    })),
  };
}

export const usualSetupMapper = {
  toResponse(profiles: UsualSetup[]): UsualSetupResponse {
    return { entries: profiles.map(toEntryResponse) };
  },
};
