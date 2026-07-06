import { describe, expect, it, vi } from 'vitest';
import { DbFeatureFlagManager } from '../../src/application/db-feature-flag-manager';
import type { IFeatureFlagService } from '../../src/domain/contracts/infrastructure/feature-flag-service';

describe('DbFeatureFlagManager', () => {
  it('delegates isEnabled to the underlying feature flag service', async () => {
    const service: IFeatureFlagService = {
      isEnabled: vi.fn().mockResolvedValue(true),
      getAll: vi.fn().mockResolvedValue({}),
    };
    const manager = new DbFeatureFlagManager(service);

    const result = await manager.isEnabled('PARTICIPATION_DEFAULT_ALL_IN', {
      churchId: 'church-1',
    });

    expect(result).toBe(true);
    expect(service.isEnabled).toHaveBeenCalledWith(
      'PARTICIPATION_DEFAULT_ALL_IN',
      { churchId: 'church-1' },
    );
  });

  it('delegates isEnabled without a context', async () => {
    const service: IFeatureFlagService = {
      isEnabled: vi.fn().mockResolvedValue(false),
      getAll: vi.fn().mockResolvedValue({}),
    };
    const manager = new DbFeatureFlagManager(service);

    const result = await manager.isEnabled('SOME_FLAG');

    expect(result).toBe(false);
    expect(service.isEnabled).toHaveBeenCalledWith('SOME_FLAG', undefined);
  });

  it('delegates getAll to the underlying feature flag service', async () => {
    const flags = { FLAG_A: true, FLAG_B: false };
    const service: IFeatureFlagService = {
      isEnabled: vi.fn().mockResolvedValue(true),
      getAll: vi.fn().mockResolvedValue(flags),
    };
    const manager = new DbFeatureFlagManager(service);

    const result = await manager.getAll({ churchId: 'church-1' });

    expect(result).toEqual(flags);
    expect(service.getAll).toHaveBeenCalledWith({ churchId: 'church-1' });
  });

  it('delegates getAll without a context', async () => {
    const service: IFeatureFlagService = {
      isEnabled: vi.fn().mockResolvedValue(true),
      getAll: vi.fn().mockResolvedValue({}),
    };
    const manager = new DbFeatureFlagManager(service);

    await manager.getAll();

    expect(service.getAll).toHaveBeenCalledWith(undefined);
  });
});
