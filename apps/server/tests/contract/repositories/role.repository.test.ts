import { NotFoundError } from '@church/core';
import { runRoleRepositoryContractTests } from '../../../src/domain/contracts/contract-tests/role.contract-spec';
import type { RoleRepository } from '../../../src/domain/contracts/role.repository';
import type { ChurchId } from '../../../src/domain/entities/church';
import type { MinistryId } from '../../../src/domain/entities/ministry';
import { Role, type RoleId } from '../../../src/domain/entities/role';

class MockRoleRepository implements RoleRepository {
  private roles = new Map<string, Role>();

  constructor() {
    const r1 = new Role(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        ministryId: '33333333-3333-3333-3333-333333333331' as MinistryId,
        name: 'Usher',
      },
      '55555555-5555-5555-5555-555555555551' as RoleId,
    );
    const r2 = new Role(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        ministryId: '33333333-3333-3333-3333-333333333331' as MinistryId,
        name: 'Greeter',
      },
      '55555555-5555-5555-5555-555555555552' as RoleId,
    );
    const r3 = new Role(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        ministryId: '33333333-3333-3333-3333-333333333332' as MinistryId,
        name: 'Teacher',
      },
      'role-3' as RoleId,
    );
    this.roles.set(r1.id, r1);
    this.roles.set(r2.id, r2);
    this.roles.set(r3.id, r3);
  }

  async getById(churchId: ChurchId, id: RoleId): Promise<Role> {
    const role = this.roles.get(id);
    if (!role || role.churchId !== churchId) {
      throw new NotFoundError('Role not found');
    }
    return role;
  }

  async listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
  ): Promise<Role[]> {
    const list = Array.from(this.roles.values()).filter(
      (r) => r.churchId === churchId && r.ministryId === ministryId,
    );
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listGlobalAndMinistryRoleIds(
    churchId: ChurchId,
    ministryIds: MinistryId[],
  ): Promise<RoleId[]> {
    return Array.from(this.roles.values())
      .filter(
        (r) =>
          r.churchId === churchId &&
          (r.isGlobal ||
            (r.ministryId != null && ministryIds.includes(r.ministryId))),
      )
      .map((r) => r.id);
  }
}

runRoleRepositoryContractTests(
  async () => new MockRoleRepository(),
  async () => {},
);
