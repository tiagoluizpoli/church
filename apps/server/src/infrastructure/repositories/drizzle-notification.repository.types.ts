import type { ChurchId } from '@/domain/branded-ids';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { Notification } from '@/domain/entities/notification';

export interface WithHiddenChoiceInput {
  churchId: ChurchId;
  items: Notification[];
  tx?: TransactionContext;
}
