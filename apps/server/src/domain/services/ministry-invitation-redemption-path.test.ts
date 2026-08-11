import { describe, expect, it } from 'vitest';
import { redemptionPathFor } from './ministry-invitation-redemption-path';

describe('redemptionPathFor', () => {
  it('keys the chained path off the Ministry Invitation id, not a Church Invitation id', () => {
    const path = redemptionPathFor({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'chained',
    });

    expect(path).toBe(
      '/invitations/church/11111111-1111-4111-8111-111111111111',
    );
  });

  it('keys the ministry-only path off the Ministry Invitation id', () => {
    const path = redemptionPathFor({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'ministry-only',
    });

    expect(path).toBe(
      '/invitations/ministry/22222222-2222-4222-8222-222222222222',
    );
  });
});
