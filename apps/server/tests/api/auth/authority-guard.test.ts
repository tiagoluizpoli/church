import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AuthorityGuard } from '../../../src/api/auth/authority-guard';

const manager = {
  canManageChurch: vi.fn(),
  canManageMinistry: vi.fn(),
  canManageParticipation: vi.fn(),
  canManageShift: vi.fn(),
  canManageEvent: vi.fn(),
  canManageEventSlot: vi.fn(),
  hasSchedulingAccess: vi.fn(),
};

function createGuard(): AuthorityGuard {
  return new AuthorityGuard(manager as never);
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
    guard.canManageEventSlot(input);
    guard.hasSchedulingAccess(input);

    expect(manager.canManageChurch).toHaveBeenCalledWith(input);
    expect(manager.canManageMinistry).toHaveBeenCalledWith(input);
    expect(manager.canManageParticipation).toHaveBeenCalledWith(input);
    expect(manager.canManageShift).toHaveBeenCalledWith(input);
    expect(manager.canManageEvent).toHaveBeenCalledWith(input);
    expect(manager.canManageEventSlot).toHaveBeenCalledWith(input);
    expect(manager.hasSchedulingAccess).toHaveBeenCalledWith(input);
  });
});
