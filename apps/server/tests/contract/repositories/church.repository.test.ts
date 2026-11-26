import { NotFoundError } from '@church/core';
import type { ChurchId } from '@/domain/branded-ids';
import type {
  ChurchRepository,
  GetChurchByIdInput,
  GetChurchBySlugInput,
  PublicContactDetails,
} from '@/domain/contracts/infrastructure/church.repository';
import { Church, type ChurchSlug } from '@/domain/entities/church';
import { runChurchRepositoryContractTests } from '@/tests/domain/contracts/contract-tests/church.contract-spec';

class MockChurchRepository implements ChurchRepository {
  private churches = new Map<string, Church>();

  constructor() {
    const church1 = new Church({
      props: {
        name: 'First Church',
        slug: 'first-church' as ChurchSlug,
      },
      id: '11111111-1111-1111-1111-111111111111' as ChurchId,
    });
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

  async listAdminUserIds(): Promise<never[]> {
    return [];
  }

  async findMemberEmail(): Promise<string | null> {
    return null;
  }

  async findMemberContact(): Promise<null> {
    return null;
  }

  async findUserName(): Promise<string | null> {
    return null;
  }

  async getSettings(): Promise<never> {
    throw new Error('not used by the contract');
  }

  async saveSettings(): Promise<void> {}
  async slugAvailability(): Promise<'free'> {
    return 'free';
  }

  async saveLogoKey(): Promise<void> {}

  async findPublicAddresses(): Promise<{
    addresses: [];
    mainAddressArea: null;
  }> {
    return { addresses: [], mainAddressArea: null };
  }

  async getAddressUsage(): Promise<null> {
    return null;
  }

  async findPublicIdentityBySlug(): Promise<null> {
    return null;
  }

  async getPublicContactDetails(): Promise<PublicContactDetails> {
    return {
      contacts: [],
      socialLinks: [],
      groupNames: [],
      legalProfile: null,
    };
  }
}

runChurchRepositoryContractTests(
  async () => new MockChurchRepository(),
  async () => {},
);
