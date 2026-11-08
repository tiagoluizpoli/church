import { instantSchema } from '@church/time';
import { z } from 'zod';
import type {
  EligibleVolunteerView,
  ParticipationCompletionView,
} from '../../domain/contracts/application/participation-manager';
import { MINISTRY_ACCESS_LEVEL_OPTIONS } from '../../domain/entities/ministry-membership';
import { assignmentMapper, assignmentResponseSchema } from './assignment.dto';

interface AssignmentWarningResponseInput {
  type: 'UNAVAILABLE' | 'DOUBLE_BOOKED' | 'FAIRNESS_EXCEEDED';
  details: string;
  conflictingId?: string;
}

interface AssignmentResultResponseInput {
  assignment: Parameters<typeof assignmentMapper.toResponse>[0];
  warnings: AssignmentWarningResponseInput[];
}

const assignmentWarningSchema = z.object({
  type: z.enum(['UNAVAILABLE', 'DOUBLE_BOOKED', 'FAIRNESS_EXCEEDED']),
  details: z.string(),
  conflictingId: z.string().optional(),
});

export const eligibleVolunteerResponseSchema = z.object({
  volunteerId: z.string(),
  volunteerName: z.string(),
  answerState: z.enum(['available', 'unanswered', 'not_asked', 'unavailable']),
  conflict: z
    .object({
      assignmentId: z.string(),
      ministryName: z.string(),
      eventTitle: z.string(),
      startTime: instantSchema,
      endTime: instantSchema,
    })
    .nullable(),
  lastServedAt: instantSchema.optional(),
  qualifiedRoleIds: z.array(z.string()),
  ministryAccessLevel: z.enum(MINISTRY_ACCESS_LEVEL_OPTIONS),
});

export const eligibleVolunteerListResponseSchema = z.object({
  volunteers: z.array(eligibleVolunteerResponseSchema),
});

export const createParticipationAssignmentBodySchema = z
  .object({
    volunteerId: z.string(),
    shiftRequirementId: z.string(),
  })
  .strict();

export const createParticipationAssignmentResponseSchema = z.object({
  assignment: assignmentResponseSchema,
  warnings: z.array(assignmentWarningSchema),
});

export const participationCompletionResponseSchema = z.object({
  participationId: z.string(),
  peopleNeeded: z.number(),
  assignedCount: z.number(),
  completionPercent: z.number(),
});

export const reassignAssignmentBodySchema = z.object({
  volunteerId: z.string(),
});

export const assignMapper = {
  eligibleVolunteerToResponse(volunteer: EligibleVolunteerView) {
    return {
      volunteerId: volunteer.volunteerId as string,
      volunteerName: volunteer.volunteerName,
      answerState: volunteer.answerState,
      conflict: volunteer.conflict,
      lastServedAt: volunteer.lastServedAt,
      qualifiedRoleIds: volunteer.qualifiedRoleIds,
      ministryAccessLevel: volunteer.ministryAccessLevel,
    };
  },
  eligibleVolunteerListToResponse(volunteers: EligibleVolunteerView[]) {
    return {
      volunteers: volunteers.map((volunteer) =>
        this.eligibleVolunteerToResponse(volunteer),
      ),
    };
  },
  assignmentResultToResponse(result: AssignmentResultResponseInput) {
    return {
      assignment: assignmentMapper.toResponse(result.assignment),
      warnings: result.warnings,
    };
  },
  completionToResponse(completion: ParticipationCompletionView) {
    return {
      participationId: completion.participationId as string,
      peopleNeeded: completion.peopleNeeded,
      assignedCount: completion.assignedCount,
      completionPercent: completion.completionPercent,
    };
  },
};
