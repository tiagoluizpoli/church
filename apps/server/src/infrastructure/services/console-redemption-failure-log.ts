import type {
  RedemptionFailureEntry,
  RedemptionFailureLog,
} from '../../domain/contracts/infrastructure/redemption-failure-log';

export class ConsoleRedemptionFailureLog implements RedemptionFailureLog {
  record(entry: RedemptionFailureEntry): void {
    console.warn('[Redemption] new-person join failed', JSON.stringify(entry));
  }
}
