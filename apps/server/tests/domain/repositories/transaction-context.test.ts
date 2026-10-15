// biome-ignore-all lint/suspicious/noExplicitAny: needed for type tests

import { describe, it } from 'vitest';
import type { AssignmentId, ChurchId, EventId } from '@/domain/branded-ids';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '@/domain/contracts/infrastructure/assignment-audit.repository';
import type { EventRepository } from '@/domain/contracts/infrastructure/event.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';

describe('User Story 4: Transaction Context Type Safety', () => {
  it('should verify all mutation methods accept an optional TransactionContext', () => {
    // This is a compilation-only type test.
    // Wrap in a conditional block to avoid runtime calls on dummy stubs.
    if (Date.now() < 0) {
      const churchId = 'church-1' as ChurchId;
      const tx = {} as TransactionContext;

      // 1. UnavailableShiftRepository (unavailable shifts)
      const unavailableShiftRepo = {} as UnavailableShiftRepository;
      unavailableShiftRepo.replaceUnavailableShiftsForCheck({
        churchId,
        availabilityCheckId: 'check-1' as any,
        shiftIds: [],
        tx,
      });
      unavailableShiftRepo.listUnavailableShiftsByCheck({
        churchId,
        availabilityCheckId: 'check-1' as any,
        tx,
      });

      // 2. EventRepository
      const eventRepo = {} as EventRepository;
      eventRepo.create(churchId, {} as any, tx);
      eventRepo.updateStatus(
        churchId,
        'event-1' as EventId,
        { status: 'scheduled' },
        tx,
      );

      // 3. EventTimeBlockRepository
      const eventTimeBlockRepo = {} as EventTimeBlockRepository;
      eventTimeBlockRepo.create(churchId, {} as any, tx);
      eventTimeBlockRepo.deleteByEvent(churchId, 'event-1' as EventId, tx);

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
