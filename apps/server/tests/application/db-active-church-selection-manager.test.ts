import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbActiveChurchSelectionManager } from '../../src/application/db-active-church-selection-manager';
import type { ChurchId, UserId } from '../../src/domain/branded-ids';

const userId = 'usr_1' as UserId;
const churchAId = 'chu_a' as ChurchId;
const churchBId = 'chu_b' as ChurchId;

const membershipRepository = {
  listByUserId: vi.fn(),
  listComparisonsByUserId: vi.fn(),
  touchOpened: vi.fn(),
};
const authorityManager = { hasSchedulingAccess: vi.fn() };
const activeChurchResolver = { resolve: vi.fn() };

function createManager(): DbActiveChurchSelectionManager {
  return new DbActiveChurchSelectionManager(
    membershipRepository as never,
    authorityManager as never,
    activeChurchResolver as never,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DbActiveChurchSelectionManager', () => {
  describe('listSelectableChurches', () => {
    it('lists every Church Membership as a selection option, resolving available areas per Church', async () => {
      membershipRepository.listComparisonsByUserId.mockResolvedValueOnce([
        {
          churchId: churchAId,
          accessLevel: 'admin',
          churchName: 'Church A',
          timezone: 'America/Sao_Paulo',
          lastOpenedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          churchId: churchBId,
          accessLevel: 'member',
          churchName: 'Church B',
          timezone: 'UTC',
          lastOpenedAt: null,
        },
      ]);
      authorityManager.hasSchedulingAccess.mockImplementation(
        async ({ churchId }: { churchId: ChurchId }) => churchId === churchAId,
      );
      const manager = createManager();

      const options = await manager.listSelectableChurches({ userId });

      expect(options).toEqual([
        {
          churchId: churchAId,
          name: 'Church A',
          timezone: 'America/Sao_Paulo',
          accessLevel: 'admin',
          availableAreas: ['dashboard', 'scheduling'],
          lastOpenedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          churchId: churchBId,
          name: 'Church B',
          timezone: 'UTC',
          accessLevel: 'member',
          availableAreas: ['dashboard'],
          lastOpenedAt: null,
        },
      ]);
      expect(authorityManager.hasSchedulingAccess).toHaveBeenCalledWith({
        userId,
        churchId: churchAId,
      });
      expect(authorityManager.hasSchedulingAccess).toHaveBeenCalledWith({
        userId,
        churchId: churchBId,
      });
    });

    it('returns an empty list for a User with no Church Membership', async () => {
      membershipRepository.listComparisonsByUserId.mockResolvedValueOnce([]);
      const manager = createManager();

      const options = await manager.listSelectableChurches({ userId });

      expect(options).toEqual([]);
      expect(authorityManager.hasSchedulingAccess).not.toHaveBeenCalled();
    });
  });

  describe('selectActiveChurch', () => {
    it('touches "last opened" and returns the resolution when the target Church resolves', async () => {
      activeChurchResolver.resolve.mockResolvedValueOnce({
        status: 'resolved',
        churchId: churchAId,
        volunteerId: null,
        autoSelected: false,
      });
      const manager = createManager();

      const result = await manager.selectActiveChurch({
        userId,
        churchId: churchAId,
      });

      expect(result).toEqual({
        status: 'resolved',
        churchId: churchAId,
        volunteerId: null,
        autoSelected: false,
      });
      expect(activeChurchResolver.resolve).toHaveBeenCalledWith({
        userId,
        activeOrganizationId: churchAId,
      });
      expect(membershipRepository.touchOpened).toHaveBeenCalledWith({
        userId,
        churchId: churchAId,
      });
    });

    it('does not touch "last opened" when the caller has no Membership in the target Church', async () => {
      activeChurchResolver.resolve.mockResolvedValueOnce({
        status: 'no_membership',
      });
      const manager = createManager();

      const result = await manager.selectActiveChurch({
        userId,
        churchId: churchBId,
      });

      expect(result).toEqual({ status: 'no_membership' });
      expect(membershipRepository.touchOpened).not.toHaveBeenCalled();
    });
  });
});
