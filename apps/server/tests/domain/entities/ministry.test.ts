import { describe, expect, it } from 'vitest';
import { Ministry } from '../../../src/domain/entities/ministry';

describe('Ministry Entity', () => {
  it('constructs with minimum props', () => {
    const ministry = new Ministry({ churchId: 'c1', name: 'Worship' });

    expect(ministry.churchId).toBe('c1');
    expect(ministry.name).toBe('Worship');
    expect(ministry.description).toBeUndefined();
    expect(ministry.enforcementType).toBe('soft');
    expect(ministry.deletedAt).toBeUndefined();
  });

  it('handles soft deletion', () => {
    const ministry = new Ministry({ churchId: 'c1', name: 'Worship' });
    const originalUpdatedAt = ministry.updatedAt;

    expect(ministry.deletedAt).toBeUndefined();

    ministry.softDelete();

    expect(ministry.deletedAt).toBeInstanceOf(Date);
    expect(ministry.updatedAt.getTime()).toBeGreaterThanOrEqual(
      originalUpdatedAt.getTime(),
    );
  });
});
