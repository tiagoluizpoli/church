import { NotFoundError } from '@church/core';
import type { ChurchId } from '../../../src/domain/branded-ids';
import { runChurchRepositoryContractTests } from '../../../src/domain/contracts/contract-tests/church.contract-spec';
import type {
  ChurchRepository,
  GetChurchByIdInput,
  GetChurchBySlugInput,
} from '../../../src/domain/contracts/infrastructure/church.repository';
import { Church, type ChurchSlug } from '../../../src/domain/entities/church';

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

  async getById({ id }: GetChurchByIdInput): Promise<Church> {
    const church = this.churches.get(id);
    if (!church) {
      throw new NotFoundError(`Church with ID ${id} not found`);
    }
    return church;
  }

  async getBySlug({ slug }: GetChurchBySlugInput): Promise<Church> {
    for (const church of this.churches.values()) {
      if (church.slug === slug) {
        return church;
      }
    }
    throw new NotFoundError(`Church with slug ${slug} not found`);
  }

  async listAdminEmails(): Promise<string[]> {
    return [];
  }
}

runChurchRepositoryContractTests(
  async () => new MockChurchRepository(),
  async () => {},
);
