import { describe, expect, it } from 'vitest';
import { Role } from '../../../src/domain/entities/role';

describe('Role Entity', () => {
  it('constructs with minimum props', () => {
    const role = new Role({ churchId: 'c1', name: 'Singer' });

    expect(role.churchId).toBe('c1');
    expect(role.name).toBe('Singer');
    expect(role.ministryId).toBeUndefined();
    expect(role.isGlobal).toBe(false);
  });
});
