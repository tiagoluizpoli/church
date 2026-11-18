import { describe, expect, it } from 'vitest';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type {
  RunTransactionInput,
  UnitOfWork,
} from '@/domain/contracts/infrastructure/unit-of-work';

class MockUnitOfWork implements UnitOfWork {
  async run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const tx = {} as TransactionContext;
    return fn(tx);
  }

  async runWith<T>({ work }: RunTransactionInput<T>): Promise<T> {
    return this.run(work);
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
