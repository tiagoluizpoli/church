import { NotFoundError } from '@church/core';
import type { ChurchId } from '../../../src/domain/entities/church';
import type { MinistryId } from '../../../src/domain/entities/ministry';
import { Role, type RoleId } from '../../../src/domain/entities/role';
import { runRoleRepositoryContractTests } from '../../../src/domain/repositories/contract-tests/role.contract-spec';
import type { RoleRepository } from '../../../src/domain/repositories/role.repository';

class MockRoleRepository implements RoleRepository {
  private roles = new Map<string, Role>();

  constructor() {
    const r1 = new Role(
      {
        churchId: 'church-1' as ChurchId,
        ministryId: 'ministry-1' as MinistryId,
        name: 'Usher',
      },
      'role-1' as RoleId,
    );
    const r2 = new Role(
      {
        churchId: 'church-1' as ChurchId,
        ministryId: 'ministry-1' as MinistryId,
        name: 'Greeter',
      },
      'role-2' as RoleId,
    );
    const r3 = new Role(
      {
        churchId: 'church-1' as ChurchId,
        ministryId: 'ministry-2' as MinistryId,
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
}

runRoleRepositoryContractTests(
  async () => new MockRoleRepository(),
  async () => {},
);
