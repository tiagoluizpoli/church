import type {
  GetPublicChurchProfileInput,
  IPublicChurchProfileManager,
  PublicChurchProfile,
} from '../domain/contracts/application/public-church-profile-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { ObjectStorage } from '../domain/contracts/infrastructure/object-storage';

interface DbPublicChurchProfileManagerDependencies {
  churchRepository: ChurchRepository;
  objectStorage: ObjectStorage;
}

/** The sign-in-free Public Church Profile, resolved by live or old slug. */
export class DbPublicChurchProfileManager
  implements IPublicChurchProfileManager
{
  private readonly churchRepository: ChurchRepository;
  private readonly objectStorage: ObjectStorage;

  constructor({
    churchRepository,
    objectStorage,
  }: DbPublicChurchProfileManagerDependencies) {
    this.churchRepository = churchRepository;
    this.objectStorage = objectStorage;
  }

  async getProfile({
    slug,
  }: GetPublicChurchProfileInput): Promise<PublicChurchProfile | null> {
    const identity = await this.churchRepository.findPublicIdentityBySlug({
      slug,
    });
    if (!identity) return null;
    return {
      slug: identity.slug,
      name: identity.name,
      accentColor: identity.accentColor,
      logoUrl: identity.logoKey
        ? this.objectStorage.publicUrl({ key: identity.logoKey })
        : null,
    };
  }
}
