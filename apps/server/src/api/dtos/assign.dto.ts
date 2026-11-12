import { instantSchema } from '@church/time';
import { z } from 'zod';
import type {
  AssignmentProposalOutcomeView,
  AssignmentProposalView,
  EligibleVolunteerView,
  ParticipationCompletionView,
} from '../../domain/contracts/application/participation-manager';
import { MINISTRY_ACCESS_LEVEL_OPTIONS } from '../../domain/entities/ministry-membership';
import {
  EMPTY_PROPOSAL_REASON_OPTIONS,
  VOLUNTEER_DECIDING_RULE_OPTIONS,
} from '../../domain/services/assignment-proposal';
import { assignmentMapper, assignmentResponseSchema } from './assignment.dto';

interface AssignmentWarningResponseInput {
  type: 'UNAVAILABLE' | 'DOUBLE_BOOKED';
  details: string;
  conflictingId?: string;
}

interface AssignmentResultResponseInput {
  assignment: Parameters<typeof assignmentMapper.toResponse>[0];
  warnings: AssignmentWarningResponseInput[];
}

const assignmentWarningSchema = z.object({
  type: z.enum(['UNAVAILABLE', 'DOUBLE_BOOKED']),
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

export const moveAssignmentBodySchema = z
  .object({
    shiftRequirementId: z.string(),
  })
  .strict();

export const reassignAssignmentBodySchema = z.object({
  volunteerId: z.string(),
});

/**
 * A preview only: the additions are explicit (shiftRequirementId,
 * volunteerId) pairs so a later apply can submit exactly what was reviewed.
 */
export const assignmentProposalResponseSchema = z.object({
  additions: z.array(
    z.object({
      volunteerId: z.string(),
      volunteerName: z.string(),
      shiftRequirementId: z.string(),
      shiftId: z.string(),
      reason: z.object({
        eligibleShiftCount: z.number(),
        needCandidateCount: z.number(),
        decidedBy: z.enum(VOLUNTEER_DECIDING_RULE_OPTIONS),
      }),
    }),
  ),
  gaps: z.array(
    z.object({
      shiftRequirementId: z.string(),
      shiftId: z.string(),
      remaining: z.number(),
    }),
  ),
  excludedUnconfirmedCount: z.number(),
  emptyReason: z.enum(EMPTY_PROPOSAL_REASON_OPTIONS).nullable(),
  /** Send back unchanged with the same pairs to Apply (ADR 0013). */
  reviewToken: z.string(),
});

const reviewedPairSchema = z
  .object({
    shiftRequirementId: z.string(),
    volunteerId: z.string(),
  })
  .strict();

export const applyAssignmentProposalBodySchema = z
  .object({
    /** One per reviewed preview; resend it on every retry of that preview. */
    applicationKey: z.uuid(),
    reviewToken: z.string().min(1),
    additions: z.array(reviewedPairSchema).min(1),
  })
  .strict();

export const assignmentProposalOutcomeResponseSchema = z.object({
  applicationKey: z.string(),
  appliedAt: instantSchema,
  /** True when a retry recovered an already committed Apply. */
  replayed: z.boolean(),
  additions: z.array(
    z.object({
      assignmentId: z.string(),
      shiftRequirementId: z.string(),
      volunteerId: z.string(),
    }),
  ),
});

export const assignMapper = {
  proposalToResponse(proposal: AssignmentProposalView) {
    return {
      additions: proposal.additions.map((addition) => ({
        volunteerId: addition.volunteerId as string,
        volunteerName: addition.volunteerName,
        shiftRequirementId: addition.shiftRequirementId as string,
        shiftId: addition.shiftId as string,
        reason: addition.reason,
      })),
      gaps: proposal.gaps.map((gap) => ({
        shiftRequirementId: gap.shiftRequirementId as string,
        shiftId: gap.shiftId as string,
        remaining: gap.remaining,
      })),
      excludedUnconfirmedCount: proposal.excludedUnconfirmedCount,
      emptyReason: proposal.emptyReason,
      reviewToken: proposal.reviewToken,
    };
  },
  proposalOutcomeToResponse(outcome: AssignmentProposalOutcomeView) {
    return {
      applicationKey: outcome.applicationKey,
      appliedAt: outcome.appliedAt,
      replayed: outcome.replayed,
      additions: outcome.additions.map((addition) => ({
        assignmentId: addition.assignmentId as string,
        shiftRequirementId: addition.shiftRequirementId as string,
        volunteerId: addition.volunteerId as string,
      })),
    };
  },
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
