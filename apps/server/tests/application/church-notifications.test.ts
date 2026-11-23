import { describe, expect, it, vi } from 'vitest';
import { ChurchNotifications } from '@/application/church-notifications';
import { ChurchId, UserId } from '@/domain/branded-ids';

const churchId = ChurchId.from('11111111-1111-4111-8111-111111111111');
const userId = UserId.from('user-1');
const ministryInvitationId = '22222222-2222-4222-8222-222222222222';

async function queuedPayload(identity: Record<string, unknown>) {
  const enqueueNotification = vi.fn();
  const notifications = new ChurchNotifications({
    outboxRepository: { enqueueNotification } as never,
    churchIdentity: { snapshot: vi.fn().mockResolvedValue(identity) },
  });
  await notifications.enqueue({
    tx: undefined as never,
    kind: 'ministry_invitation',
    to: [{ userId, churchId }],
    data: { ministryInvitationId },
  });
  return enqueueNotification.mock.calls[0]?.[0].payload;
}

describe('ChurchNotifications ministry_invitation locality', () => {
  it('freezes the snapshotted Main Address locality into the queued request', async () => {
    const payload = await queuedPayload({
      churchLogoUrl: null,
      churchAccent: null,
      churchLocality: 'Centro, Campinas/SP',
    });

    expect(payload.data.churchLocality).toBe('Centro, Campinas/SP');
  });

  it('adds nothing without an address', async () => {
    const payload = await queuedPayload({
      churchLogoUrl: null,
      churchAccent: null,
    });

    expect(payload.data).toEqual({
      ministryInvitationId,
      churchLogoUrl: null,
      churchAccent: null,
    });
  });
});
