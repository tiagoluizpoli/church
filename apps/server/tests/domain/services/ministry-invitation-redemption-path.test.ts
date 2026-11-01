import { describe, expect, it } from 'vitest';
import { redemptionPathFor } from '@/domain/services/ministry-invitation-redemption-path';

describe('redemptionPathFor', () => {
  it('keys a paired invitation link off its Church Invitation id', () => {
    const path = redemptionPathFor({
      id: '11111111-1111-4111-8111-111111111111',
      churchInvitationId: '33333333-3333-4333-8333-333333333333',
    });

    expect(path).toBe(
      '/invitations/church/33333333-3333-4333-8333-333333333333',
    );
  });

  it('keys the ministry-only path off the Ministry Invitation id', () => {
    const path = redemptionPathFor({
      id: '22222222-2222-4222-8222-222222222222',
    });

    expect(path).toBe(
      '/invitations/ministry/22222222-2222-4222-8222-222222222222',
    );
  });
});
