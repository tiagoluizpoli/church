import { describe, expect, it, vi } from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import {
  ChurchId,
  MinistryId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';

const manager = {
  canManageChurch: vi.fn(),
  canManageMinistry: vi.fn(),
  canManageParticipation: vi.fn(),
  canManageShift: vi.fn(),
  canManageEvent: vi.fn(),
  canManageEventTimeBlock: vi.fn(),
  hasSchedulingAccess: vi.fn(),
};

function createGuard(): AuthorityGuard {
  return new AuthorityGuard({ manager: manager as never });
}

describe('AuthorityGuard', () => {
  it('delegates every method to IAuthorityManager', () => {
    const guard = createGuard();
    const input = { churchId: 'chu_1', userId: 'usr_1' } as never;

    guard.canManageChurch(input);
    guard.canManageMinistry(input);
    guard.canManageParticipation(input);
    guard.canManageShift(input);
    guard.canManageEvent(input);
    guard.canManageEventTimeBlock(input);
    guard.hasSchedulingAccess(input);

    expect(manager.canManageChurch).toHaveBeenCalledWith(input);
    expect(manager.canManageMinistry).toHaveBeenCalledWith(input);
    expect(manager.canManageParticipation).toHaveBeenCalledWith(input);
    expect(manager.canManageShift).toHaveBeenCalledWith(input);
    expect(manager.canManageEvent).toHaveBeenCalledWith(input);
    expect(manager.canManageEventTimeBlock).toHaveBeenCalledWith(input);
    expect(manager.hasSchedulingAccess).toHaveBeenCalledWith(input);
  });
});

it('exposes the gatekeeper object decision through the controller guard', async () => {
  const churchId = ChurchId.from('11111111-1111-4111-8111-111111111111');
  const userId = UserId.from('guard-user');
  const ministryId = MinistryId.from('22222222-2222-4222-8222-222222222222');
  const ownerVolunteerId = VolunteerId.from(
    '33333333-3333-4333-8333-333333333333',
  );
  const realManager = new DbAuthorityManager({
    actorRepository: {
      resolveActor: async () => ({
        userId,
        activeChurchId: churchId,
        volunteerId: null,
        churchMembership: { churchId, accessLevel: 'admin' },
        ministryMemberships: [],
      }),
    },
    scopeRepository: {} as never,
    eventRepository: {} as never,
    eventTimeBlockRepository: {} as never,
    ministryRepository: {} as never,
  });
  const guard = new AuthorityGuard({ manager: realManager });
  await expect(
    guard.decideAuthority({
      churchId,
      userId,
      action: 'participate',
      resource: { type: 'ministry', churchId, ministryId, ownerVolunteerId },
      scope: 'object',
    }),
  ).resolves.toEqual({ allowed: false, reason: 'OUTSIDE_SCOPE' });
});
