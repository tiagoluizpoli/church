import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { DbSchedulingRbacManager } from '../../src/application/db-scheduling-rbac-manager';
import type {
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  UserId,
} from '../../src/domain/branded-ids';
import type { SchedulingScopeRepository } from '../../src/domain/contracts/infrastructure/scheduling-scope.repository';

const churchId = '11111111-1111-1111-1111-111111111111' as ChurchId;
const ministryId = '33333333-3333-3333-3333-333333333331' as MinistryId;
const participationId =
  '61616161-6161-6161-6161-616161616161' as MinistryParticipationId;
const shiftId = '71717171-7171-7171-7171-717171717171' as ShiftId;
const userId = 'admin-leader' as UserId;

function createScopes(): SchedulingScopeRepository {
  return {
    resolveParticipationMinistry: vi.fn(async () => ministryId),
    resolveShiftMinistry: vi.fn(async () => ministryId),
    isChurchAdmin: vi.fn(async () => false),
    isMinistryLeader: vi.fn(async () => false),
  };
}

describe('DbSchedulingRbacManager', () => {
  it('resolves participation and shift scope through their ministry', async () => {
    const scopes = createScopes();
    vi.mocked(scopes.isMinistryLeader).mockResolvedValue(true);
    const manager = new DbSchedulingRbacManager(scopes);

    await expect(
      manager.canManageParticipation({ churchId, participationId, userId }),
    ).resolves.toBe(true);
    await expect(
      manager.canManageShift({ churchId, shiftId, userId }),
    ).resolves.toBe(true);
  });

  it('allows a church admin independently of ministry leadership', async () => {
    const scopes = createScopes();
    vi.mocked(scopes.isChurchAdmin).mockResolvedValue(true);
    const manager = new DbSchedulingRbacManager(scopes);

    await expect(
      manager.canManageParticipation({ churchId, participationId, userId }),
    ).resolves.toBe(true);
    expect(scopes.isMinistryLeader).not.toHaveBeenCalled();
  });

  it('supports the same user as admin and ministry leader without collapsing roles', async () => {
    const scopes = createScopes();
    vi.mocked(scopes.isChurchAdmin)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    vi.mocked(scopes.isMinistryLeader).mockResolvedValue(true);
    const manager = new DbSchedulingRbacManager(scopes);

    await expect(
      manager.canManageParticipation({ churchId, participationId, userId }),
    ).resolves.toBe(true);
    await expect(
      manager.canManageShift({ churchId, shiftId, userId }),
    ).resolves.toBe(true);
  });

  it('denies missing and cross-church resource scopes', async () => {
    const scopes = createScopes();
    vi.mocked(scopes.resolveParticipationMinistry).mockResolvedValue(null);
    const manager = new DbSchedulingRbacManager(scopes);

    await expect(
      manager.canManageParticipation({ churchId, participationId, userId }),
    ).resolves.toBe(false);
    expect(scopes.isChurchAdmin).not.toHaveBeenCalled();
  });
});
