import { vi } from 'vitest';
import type { NotificationService } from '../domain/contracts/infrastructure/notification-service';

export function createNotificationServiceSpy() {
  const spy = {
    publish: vi.fn<NotificationService['publish']>(),
    notifyVolunteer: vi.fn<NotificationService['notifyVolunteer']>(),
    notifyLeaderOfDecline:
      vi.fn<NotificationService['notifyLeaderOfDecline']>(),
  } satisfies NotificationService;

  spy.publish.mockResolvedValue(undefined);
  spy.notifyVolunteer.mockResolvedValue(undefined);
  spy.notifyLeaderOfDecline.mockResolvedValue(undefined);

  return spy;
}
