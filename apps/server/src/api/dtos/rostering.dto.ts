import { z } from 'zod';
import type {
  EligibleVolunteerView,
  ParticipationCompletionView,
} from '../../domain/contracts/application/participation-manager';
import { assignmentMapper, assignmentResponseSchema } from './assignment.dto';

const assignmentWarningSchema = z.object({
  type: z.enum(['UNAVAILABLE', 'DOUBLE_BOOKED', 'FAIRNESS_EXCEEDED']),
  details: z.string(),
  conflictingId: z.string().optional(),
});

export const eligibleVolunteerResponseSchema = z.object({
  volunteerId: z.string(),
  volunteerName: z.string(),
  isAvailable: z.boolean(),
  hasConflict: z.boolean(),
  lastServedAt: z.string().optional(),
});

export const eligibleVolunteerListResponseSchema = z.object({
  volunteers: z.array(eligibleVolunteerResponseSchema),
});

export const createParticipationAssignmentBodySchema = z.object({
  volunteerId: z.string(),
  roleId: z.string(),
  teamId: z.string().optional(),
  override: z
    .object({
      reason: z.string().trim().min(10),
    })
    .optional(),
});

export const createParticipationAssignmentResponseSchema = z.object({
  assignment: assignmentResponseSchema,
  warnings: z.array(assignmentWarningSchema),
});

export const participationCompletionResponseSchema = z.object({
  participationId: z.string(),
  requiredCount: z.number(),
  assignedCount: z.number(),
  completionPercent: z.number(),
});

export const publishParticipationBodySchema = z.object({
  confirmBelowFull: z.boolean().optional(),
});

export const rosteringMapper = {
  eligibleVolunteerToResponse(volunteer: EligibleVolunteerView) {
    return {
      volunteerId: volunteer.volunteerId as string,
      volunteerName: volunteer.volunteerName,
      isAvailable: volunteer.isAvailable,
      hasConflict: volunteer.hasConflict,
      lastServedAt: volunteer.lastServedAt?.toISOString(),
    };
  },
  eligibleVolunteerListToResponse(volunteers: EligibleVolunteerView[]) {
    return {
      volunteers: volunteers.map((volunteer) =>
        this.eligibleVolunteerToResponse(volunteer),
      ),
    };
  },
  assignmentResultToResponse(result: {
    assignment: Parameters<typeof assignmentMapper.toResponse>[0];
    warnings: Array<{
      type: 'UNAVAILABLE' | 'DOUBLE_BOOKED' | 'FAIRNESS_EXCEEDED';
      details: string;
      conflictingId?: string;
    }>;
  }) {
    return {
      assignment: assignmentMapper.toResponse(result.assignment),
      warnings: result.warnings,
    };
  },
  completionToResponse(completion: ParticipationCompletionView) {
    return {
      participationId: completion.participationId as string,
      requiredCount: completion.requiredCount,
      assignedCount: completion.assignedCount,
      completionPercent: completion.completionPercent,
    };
  },
};
