import { NotFoundError } from '@church/core';
import type { ChurchId } from '../../../src/domain/entities/church';
import {
  Ministry,
  type MinistryId,
  type MinistrySettings,
} from '../../../src/domain/entities/ministry';
import { runMinistryRepositoryContractTests } from '../../../src/domain/repositories/contract-tests/ministry.contract-spec';
import type { MinistryRepository } from '../../../src/domain/repositories/ministry.repository';

class MockMinistryRepository implements MinistryRepository {
  private ministries = new Map<string, Ministry>();

  constructor() {
    const min1 = new Ministry(
      {
        churchId: 'church-1' as ChurchId,
        name: 'Youth Ministry',
        enforcementType: 'soft',
      },
      'ministry-1' as MinistryId,
    );
    const min2 = new Ministry(
      {
        churchId: 'church-1' as ChurchId,
        name: 'Adult Ministry',
        enforcementType: 'soft',
      },
      'ministry-2' as MinistryId,
    );
    const min3 = new Ministry(
      {
        churchId: 'church-2' as ChurchId,
        name: 'Other Ministry',
        enforcementType: 'soft',
      },
      'ministry-3' as MinistryId,
    );
    this.ministries.set(min1.id, min1);
    this.ministries.set(min2.id, min2);
    this.ministries.set(min3.id, min3);
  }

  async getById(churchId: ChurchId, id: MinistryId): Promise<Ministry> {
    const min = this.ministries.get(id);
    if (!min || min.churchId !== churchId) {
      throw new NotFoundError('Ministry not found');
    }
    return min;
  }

  async listByChurch(churchId: ChurchId): Promise<Ministry[]> {
    const list = Array.from(this.ministries.values()).filter(
      (m) => m.churchId === churchId,
    );
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSettings(
    churchId: ChurchId,
    ministryId: MinistryId,
  ): Promise<MinistrySettings> {
    const min = await this.getById(churchId, ministryId);
    return {
      enforcementType: min.enforcementType,
    };
  }
}

runMinistryRepositoryContractTests(
  async () => new MockMinistryRepository(),
  async () => {},
);
