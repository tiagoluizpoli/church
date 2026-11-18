import { describe, expect, it } from 'vitest';
import { notificationUnreadLabel } from '@/features/notifications/lib/notification-unread-label';

describe('notification unread count', () => {
  it('uses the singular only for one unread item', () => {
    expect(notificationUnreadLabel(0)).toBe('0 não lidas');
    expect(notificationUnreadLabel(1)).toBe('1 não lida');
    expect(notificationUnreadLabel(2)).toBe('2 não lidas');
  });
});
