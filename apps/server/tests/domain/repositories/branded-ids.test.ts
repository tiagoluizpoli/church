import { describe, it } from 'vitest';
import type { AssignmentId } from '../../../src/domain/entities/assignment';
import type { ChurchId } from '../../../src/domain/entities/church';
import type { VolunteerId } from '../../../src/domain/entities/volunteer';
import type { AssignmentRepository } from '../../../src/domain/repositories/assignment.repository';

describe('User Story 3: Branded IDs Isolation Type Safety', () => {
  it('should prevent cross-entity ID swapping between different branded types', () => {
    // This test verifies that branded types (e.g., AssignmentId vs VolunteerId) cannot be swapped.
    // If the type safety is breached, removing `@ts-expect-error` will compile without errors.
    // Wrap in a conditional block to avoid runtime calls on the dummy stub.
    if (Date.now() < 0) {
      const churchId = 'church-1' as ChurchId;
      const volunteerId = 'volunteer-1' as VolunteerId;
      const assignmentId = 'assignment-1' as AssignmentId;

      const assignmentRepo = {} as AssignmentRepository;

      // Normal invocation should compile
      assignmentRepo.getById(churchId, assignmentId);

      // Swapping IDs should cause compile-time error
      // @ts-expect-error - Expected AssignmentId, but got VolunteerId
      assignmentRepo.getById(churchId, volunteerId);

      // Swapping IDs should cause compile-time error
      // @ts-expect-error - Expected AssignmentId, but got ChurchId
      assignmentRepo.getById(churchId, churchId);
    }
  });
});
