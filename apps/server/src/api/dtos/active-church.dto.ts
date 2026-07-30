import { z } from 'zod';
import type { ActiveChurchResolution } from '../../domain/contracts/application/active-church-resolver';
import type { ChurchSelectionOption } from '../../domain/contracts/application/active-church-selection-manager';

export const activeChurchStatusResponseSchema = z.object({
  status: z.enum(['resolved', 'selection_required', 'no_membership']),
  churchId: z.string().optional(),
});
export type ActiveChurchStatusResponse = z.infer<
  typeof activeChurchStatusResponseSchema
>;

export const churchSelectionOptionResponseSchema = z.object({
  churchId: z.string(),
  name: z.string(),
  timezone: z.string(),
  accessLevel: z.enum(['member', 'admin']),
  availableAreas: z.array(z.enum(['dashboard', 'scheduling'])),
  lastOpenedAt: z.string().nullable(),
});
export type ChurchSelectionOptionResponse = z.infer<
  typeof churchSelectionOptionResponseSchema
>;

export const churchSelectionListResponseSchema = z.object({
  churches: z.array(churchSelectionOptionResponseSchema),
});

export const selectActiveChurchBodySchema = z.object({
  churchId: z.string(),
});
export type SelectActiveChurchBody = z.infer<
  typeof selectActiveChurchBodySchema
>;

export const activeChurchMapper = {
  toStatusResponse(
    resolution: ActiveChurchResolution,
  ): ActiveChurchStatusResponse {
    return resolution.status === 'resolved'
      ? { status: resolution.status, churchId: resolution.churchId }
      : { status: resolution.status };
  },

  toSelectionOptionResponse(
    option: ChurchSelectionOption,
  ): ChurchSelectionOptionResponse {
    return {
      churchId: option.churchId,
      name: option.name,
      timezone: option.timezone,
      accessLevel: option.accessLevel,
      availableAreas: option.availableAreas,
      lastOpenedAt: option.lastOpenedAt
        ? option.lastOpenedAt.toISOString()
        : null,
    };
  },

  toSelectionListResponse(options: ChurchSelectionOption[]) {
    return {
      churches: options.map((option) =>
        activeChurchMapper.toSelectionOptionResponse(option),
      ),
    };
  },
};
