import { z } from 'zod';
import type {
  ActiveChurchSelectionRequired,
  NoChurchMembership,
  ResolvedActiveChurch,
} from '../../domain/contracts/application/active-church-resolver';
import type { ChurchSelectionOption } from '../../domain/contracts/application/active-church-selection-manager';

/** Name of the Church the caller's Membership was just found removed from, when that's why this status resolved. */
const membershipRemovedFromSchema = z.string().optional();

const resolvedActiveChurchStatusSchema = z.object({
  status: z.literal('resolved'),
  churchId: z.string(),
  membershipRemovedFrom: membershipRemovedFromSchema,
  /** IANA Church Timezone of the resolved Church — every displayed time and CalendarDay resolves through it (ADR-0003). */
  timezone: z.string(),
});

const unresolvedActiveChurchStatusSchema = z.object({
  status: z.enum(['selection_required', 'no_membership']),
  membershipRemovedFrom: membershipRemovedFromSchema,
});

/** A resolved status always names its Church and that Church's Timezone; the others carry neither. */
export const activeChurchStatusResponseSchema = z.discriminatedUnion('status', [
  resolvedActiveChurchStatusSchema,
  unresolvedActiveChurchStatusSchema,
]);
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

export interface ToResolvedStatusResponseInput {
  resolution: ResolvedActiveChurch;
  /** IANA Church Timezone of `resolution.churchId`. */
  timezone: string;
}

export type UnresolvedActiveChurch =
  | NoChurchMembership
  | ActiveChurchSelectionRequired;

export interface ToUnresolvedStatusResponseInput {
  resolution: UnresolvedActiveChurch;
}

export const activeChurchMapper = {
  toResolvedStatusResponse({
    resolution,
    timezone,
  }: ToResolvedStatusResponseInput): ActiveChurchStatusResponse {
    return {
      status: resolution.status,
      churchId: resolution.churchId,
      membershipRemovedFrom: resolution.membershipRemovedFrom,
      timezone,
    };
  },

  toUnresolvedStatusResponse({
    resolution,
  }: ToUnresolvedStatusResponseInput): ActiveChurchStatusResponse {
    return {
      status: resolution.status,
      membershipRemovedFrom: resolution.membershipRemovedFrom,
    };
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
