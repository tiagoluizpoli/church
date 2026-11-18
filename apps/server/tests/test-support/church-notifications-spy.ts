import { vi } from 'vitest';
import type { IChurchNotifications } from '@/domain/contracts/application/church-notifications';

/** Records `notifications.enqueue` calls for manager tests that do not need the outbox. */
export function createChurchNotificationsSpy() {
  const spy = { enqueue: vi.fn<IChurchNotifications['enqueue']>() };
  spy.enqueue.mockResolvedValue(undefined);
  return spy satisfies IChurchNotifications;
}
