import {
  AssignmentFactsReader,
  AssignmentLifecycle,
} from '@/application/assignment-lifecycle';
import type {
  IAssignmentFactsReader,
  IAssignmentLifecycle,
} from '@/domain/contracts/application/assignment-lifecycle';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '@/domain/contracts/infrastructure/assignment-audit.repository';
import type { EventRepository } from '@/domain/contracts/infrastructure/event.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { SwapRequestRepository } from '@/domain/contracts/infrastructure/swap-request.repository';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '@/infrastructure/repositories/drizzle-assignment-audit.repository';
import type { AnyDrizzleDb } from '@/infrastructure/repositories/drizzle-db.types';
import { DrizzleEventRepository } from '@/infrastructure/repositories/drizzle-event.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleSwapRequestRepository } from '@/infrastructure/repositories/drizzle-swap-request.repository';
import { DrizzleUnavailableShiftRepository } from '@/infrastructure/repositories/drizzle-unavailable-shift.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';

/**
 * The Assignment lifecycle and facts reader the composition root injects into
 * the scheduling managers, built the same way for tests.
 */

export interface AssignmentLifecycleRepositories {
  assignmentRepository: AssignmentRepository;
  auditRepository: AssignmentAuditRepository;
  swapRequestRepository: SwapRequestRepository;
  participationRepository: MinistryParticipationRepository;
  shiftRepository: ShiftRepository;
  eventRepository: EventRepository;
  eventTimeBlockRepository: EventTimeBlockRepository;
  volunteerRepository: VolunteerRepository;
  unavailableShiftRepository: UnavailableShiftRepository;
}

export interface AssignmentLifecycleParts {
  assignmentLifecycle: IAssignmentLifecycle;
  assignmentFactsReader: IAssignmentFactsReader;
}

/** From the given repositories, e.g. a suite's fakes. */
export function buildAssignmentLifecycle({
  assignmentRepository,
  auditRepository,
  swapRequestRepository,
  participationRepository,
  ...readers
}: AssignmentLifecycleRepositories): AssignmentLifecycleParts {
  return {
    assignmentLifecycle: new AssignmentLifecycle({
      assignmentRepository,
      auditRepository,
      swapRequestRepository,
      participationRepository,
    }),
    assignmentFactsReader: new AssignmentFactsReader({
      assignmentRepository,
      ...readers,
    }),
  };
}

export interface DrizzleAssignmentLifecycleInput {
  db: AnyDrizzleDb;
  /** Replaces a repository, e.g. to pause a write mid-transaction. */
  overrides?: Partial<AssignmentLifecycleRepositories>;
}

/** From Drizzle repositories on `db`. */
export function buildDrizzleAssignmentLifecycle({
  db,
  overrides,
}: DrizzleAssignmentLifecycleInput): AssignmentLifecycleParts {
  return buildAssignmentLifecycle({
    assignmentRepository: new DrizzleAssignmentRepository({ db }),
    auditRepository: new DrizzleAssignmentAuditRepository({ db }),
    swapRequestRepository: new DrizzleSwapRequestRepository({ db }),
    participationRepository: new DrizzleMinistryParticipationRepository({ db }),
    shiftRepository: new DrizzleShiftRepository({ db }),
    eventRepository: new DrizzleEventRepository({ db }),
    eventTimeBlockRepository: new DrizzleEventTimeBlockRepository({ db }),
    volunteerRepository: new DrizzleVolunteerRepository({ db }),
    unavailableShiftRepository: new DrizzleUnavailableShiftRepository({ db }),
    ...overrides,
  });
}
