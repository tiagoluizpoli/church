import { NotFoundError } from '@church/core';
import type { ChurchRepository } from '../../../src/domain/contracts/church.repository';
import { runChurchRepositoryContractTests } from '../../../src/domain/contracts/contract-tests/church.contract-spec';
import {
  Church,
  type ChurchId,
  type ChurchSlug,
} from '../../../src/domain/entities/church';

class MockChurchRepository implements ChurchRepository {
  private churches = new Map<string, Church>();

  constructor() {
    const church1 = new Church(
      {
        name: 'First Church',
        slug: 'first-church' as ChurchSlug,
      },
      '11111111-1111-1111-1111-111111111111' as ChurchId,
    );
    this.churches.set(church1.id, church1);
  }

  async getById(id: ChurchId): Promise<Church> {
    const church = this.churches.get(id);
    if (!church) {
      throw new NotFoundError(`Church with ID ${id} not found`);
    }
    return church;
  }

  async getBySlug(slug: ChurchSlug): Promise<Church> {
    for (const church of this.churches.values()) {
      if (church.slug === slug) {
        return church;
      }
    }
    throw new NotFoundError(`Church with slug ${slug} not found`);
  }
}

runChurchRepositoryContractTests(
  async () => new MockChurchRepository(),
  async () => {},
);
