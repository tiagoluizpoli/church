import { parseTimeOfDay, timeOfDaySchema } from '@church/time';
import { z } from 'zod';
import {
  RoleId,
  SectorId,
  type TemplateTimeBlockId,
} from '../../domain/branded-ids';
import type { UsualSetupBlockView } from '../../domain/contracts/application/participation-manager';
import type {
  UsualSetup,
  UsualSetupEntryInput,
  UsualSetupShiftSplit,
} from '../../domain/entities/usual-setup';

const usualSetupHeadcountSchema = z.object({
  shiftIndex: z.number().int().min(0),
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
type UsualSetupShiftSplitBody = z.infer<typeof usualSetupShiftSplitSchema>;

/** One block's complete entry; blank and zero counts are omitted, not sent. */
export const usualSetupEntryBodySchema = z.object({
  serves: z.boolean(),
  shiftSplit: usualSetupShiftSplitSchema,
  headcounts: z.array(usualSetupHeadcountSchema),
});
export type UsualSetupEntryBody = z.infer<typeof usualSetupEntryBodySchema>;

export const usualSetupBlockResponseSchema = z.object({
  templateId: z.string(),
  templateName: z.string(),
  weekday: z.number().int(),
  sourceTemplateTimeBlockId: z.string(),
  label: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  order: z.number().int(),
  entry: usualSetupEntryBodySchema.optional(),
  needsReview: z.boolean(),
});
type UsualSetupBlockResponse = z.infer<typeof usualSetupBlockResponseSchema>;

export const usualSetupBlockListResponseSchema = z.object({
  blocks: z.array(usualSetupBlockResponseSchema),
});
type UsualSetupBlockListResponse = z.infer<
  typeof usualSetupBlockListResponseSchema
>;

export const setDefaultDirectionBodySchema = z.object({
  defaultDirection: z.enum(['all_in', 'all_out']),
});
export type SetDefaultDirectionBody = z.infer<
  typeof setDefaultDirectionBodySchema
>;

function toShiftSplit(
  shiftSplit: UsualSetupShiftSplitBody,
): UsualSetupShiftSplit {
  if (shiftSplit.kind === 'equal') return shiftSplit;
  return {
    kind: 'manual',
    spans: shiftSplit.spans.map((span) => ({
      label: span.label,
      startTime: parseTimeOfDay({ value: span.startTime }),
      endTime: parseTimeOfDay({ value: span.endTime }),
    })),
  };
}

interface ToUsualSetupEntryInput {
  sourceTemplateTimeBlockId: TemplateTimeBlockId;
  body: UsualSetupEntryBody;
}

function toEntryResponse(entry: UsualSetup): UsualSetupEntryBody {
  return {
    serves: entry.serves,
    shiftSplit: entry.shiftSplit,
    headcounts: entry.headcounts.map((headcount) => ({
      shiftIndex: headcount.shiftIndex,
      sectorId: headcount.sectorId as string,
      roleId: headcount.roleId as string,
      peopleNeeded: headcount.peopleNeeded,
    })),
  };
}

export const usualSetupMapper = {
  toEntryInput({
    sourceTemplateTimeBlockId,
    body,
  }: ToUsualSetupEntryInput): UsualSetupEntryInput {
    return {
      sourceTemplateTimeBlockId,
      serves: body.serves,
      shiftSplit: toShiftSplit(body.shiftSplit),
      headcounts: body.headcounts.map((headcount) => ({
        shiftIndex: headcount.shiftIndex,
        sectorId: SectorId.from(headcount.sectorId),
        roleId: RoleId.from(headcount.roleId),
        peopleNeeded: headcount.peopleNeeded,
      })),
    };
  },

  toBlockResponse(view: UsualSetupBlockView): UsualSetupBlockResponse {
    return {
      templateId: view.templateId as string,
      templateName: view.templateName,
      weekday: view.weekday,
      sourceTemplateTimeBlockId: view.sourceTemplateTimeBlockId as string,
      label: view.label,
      startTime: view.startTime,
      endTime: view.endTime,
      order: view.order,
      entry: view.entry ? toEntryResponse(view.entry) : undefined,
      needsReview: view.needsReview,
    };
  },

  toBlockListResponse(
    views: UsualSetupBlockView[],
  ): UsualSetupBlockListResponse {
    return { blocks: views.map(usualSetupMapper.toBlockResponse) };
  },
};
