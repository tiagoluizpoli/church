// biome-ignore-all lint/suspicious/noExplicitAny: needed for type tests
import { describe, it } from 'vitest';
import type { AssignmentId } from '../../../src/domain/entities/assignment';
import type { AvailabilityId } from '../../../src/domain/entities/availability';
import type { ChurchId } from '../../../src/domain/entities/church';
import type { EventId } from '../../../src/domain/entities/event';
import type { AssignmentRepository } from '../../../src/domain/repositories/assignment.repository';
import type { AssignmentAuditRepository } from '../../../src/domain/repositories/assignment-audit.repository';
import type { AvailabilityRepository } from '../../../src/domain/repositories/availability.repository';
import type { EventRepository } from '../../../src/domain/repositories/event.repository';
import type { TimeSlotRepository } from '../../../src/domain/repositories/time-slot.repository';
import type { TransactionContext } from '../../../src/domain/repositories/transaction-context';

describe('User Story 4: Transaction Context Type Safety', () => {
  it('should verify all mutation methods accept an optional TransactionContext', () => {
    // This is a compilation-only type test.
    // Wrap in a conditional block to avoid runtime calls on dummy stubs.
    if (Date.now() < 0) {
      const churchId = 'church-1' as ChurchId;
      const tx = {} as TransactionContext;

      // 1. AvailabilityRepository
      const availabilityRepo = {} as AvailabilityRepository;
      availabilityRepo.create(churchId, {} as any, tx);
      availabilityRepo.update(
        churchId,
        'availability-1' as AvailabilityId,
        {} as any,
        tx,
      );
      availabilityRepo.delete(churchId, 'availability-1' as AvailabilityId, tx);

      // 2. EventRepository
      const eventRepo = {} as EventRepository;
      eventRepo.create(churchId, {} as any, tx);
      eventRepo.updateStatus(
        churchId,
        'event-1' as EventId,
        { status: 'published' },
        tx,
      );

      // 3. TimeSlotRepository
      const timeSlotRepo = {} as TimeSlotRepository;
      timeSlotRepo.bulkCreate(churchId, {} as any, tx);
      timeSlotRepo.deleteByEvent(churchId, 'event-1' as EventId, tx);

      // 4. AssignmentRepository
      const assignmentRepo = {} as AssignmentRepository;
      assignmentRepo.create(churchId, {} as any, tx);
      assignmentRepo.updateStatus(
        churchId,
        'assignment-1' as AssignmentId,
        {} as any,
        tx,
      );
      assignmentRepo.deleteByEvent(churchId, 'event-1' as EventId, tx);

      // 5. AssignmentAuditRepository
      const auditRepo = {} as AssignmentAuditRepository;
      auditRepo.create(churchId, {} as any, tx);
    }
  });
});
