// biome-ignore-all lint/suspicious/noExplicitAny: needed for test mocks

import { describe, expect, it } from 'vitest';
import type { AssignmentId, ChurchId } from '../../../src/domain/branded-ids';
import type { AssignmentRepository } from '../../../src/domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '../../../src/domain/contracts/infrastructure/assignment-audit.repository';
import type { TransactionContext } from '../../../src/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../../../src/domain/contracts/infrastructure/unit-of-work';

describe('User Story 4: UnitOfWork Integration', () => {
  it('should run a callback within a transaction context and allow repositories to share the transaction context', async () => {
    // 1. Define a Mock UnitOfWork
    const mockTxContext = {} as TransactionContext;

    const mockUnitOfWork: UnitOfWork = {
      async run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
        // Run the callback passing the transaction context
        return fn(mockTxContext);
      },
    };

    // 2. Define Mock repositories that keep track of the transaction context they received
    const txRecords: TransactionContext[] = [];

    const mockAssignmentRepo: Partial<AssignmentRepository> = {
      async updateStatus(_churchId, _id, _input, tx) {
        if (tx) {
          txRecords.push(tx);
        }
      },
    };

    const mockAuditRepo: Partial<AssignmentAuditRepository> = {
      async create(_churchId, _input, tx) {
        if (tx) {
          txRecords.push(tx);
        }
        return { id: 'audit-gen' } as any;
      },
    };

    // 3. Execute the workflow inside the UnitOfWork block
    const churchId = 'church-1' as ChurchId;
    const assignmentId = 'assignment-1' as AssignmentId;

    await mockUnitOfWork.run(async (tx) => {
      // Both operations share the same transaction context
      await mockAssignmentRepo.updateStatus?.(
        churchId,
        assignmentId,
        { status: 'confirmed' },
        tx,
      );
      await mockAuditRepo.create?.(
        churchId,
        {
          assignmentId,
          actorId: 'user-1' as any,
          action: 'status_change',
          reason: 'Confirmed by user',
        },
        tx,
      );
    });

    // 4. Verify that both repository operations received the correct transaction context
    expect(txRecords.length).toBe(2);
    expect(txRecords[0]).toBe(mockTxContext);
    expect(txRecords[1]).toBe(mockTxContext);
  });
});
