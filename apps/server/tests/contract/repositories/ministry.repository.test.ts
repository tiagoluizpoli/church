import { NotFoundError } from '@church/core';
import type { ChurchId, MinistryId } from '@/domain/branded-ids';
import type {
  MinistryRepository,
  UpdateMinistryDefaultDirectionInput,
} from '@/domain/contracts/infrastructure/ministry.repository';
import { Ministry, type MinistrySettings } from '@/domain/entities/ministry';
import { runMinistryRepositoryContractTests } from '@/tests/domain/contracts/contract-tests/ministry.contract-spec';

class MockMinistryRepository implements MinistryRepository {
  private ministries = new Map<string, Ministry>();

  constructor() {
    const min1 = new Ministry({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        name: 'Youth Ministry',
      },
      id: '33333333-3333-3333-3333-333333333331' as MinistryId,
    });
    const min2 = new Ministry({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        name: 'Adult Ministry',
      },
      id: '33333333-3333-3333-3333-333333333332' as MinistryId,
    });
    const min3 = new Ministry({
      props: {
        churchId: '11111111-1111-1111-1111-111111111112' as ChurchId,
        name: 'Other Ministry',
      },
      id: 'ministry-3' as MinistryId,
    });
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
      defaultDirection: min.defaultDirection,
    };
  }

  async updateDefaultDirection(
    input: UpdateMinistryDefaultDirectionInput,
  ): Promise<Ministry> {
    const current = await this.getById(input.churchId, input.ministryId);
    const updated = new Ministry({
      props: {
        churchId: current.churchId,
        name: current.name,
        description: current.description,
        defaultDirection: input.defaultDirection,
      },
      id: current.id,
    });
    this.ministries.set(updated.id, updated);
    return updated;
  }
}

runMinistryRepositoryContractTests(
  async () => new MockMinistryRepository(),
  async () => {},
);
