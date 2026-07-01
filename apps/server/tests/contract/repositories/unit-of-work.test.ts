import { describe, expect, it } from 'vitest';
import type { TransactionContext } from '../../../src/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../../../src/domain/contracts/infrastructure/unit-of-work';

class MockUnitOfWork implements UnitOfWork {
  async run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const tx = {} as TransactionContext;
    return fn(tx);
  }
}

describe('UnitOfWork Contract', () => {
  it('should execute callback with TransactionContext and return value', async () => {
    const uow = new MockUnitOfWork();
    const result = await uow.run(async (tx) => {
      expect(tx).toBeDefined();
      return 'success';
    });
    expect(result).toBe('success');
  });
});
