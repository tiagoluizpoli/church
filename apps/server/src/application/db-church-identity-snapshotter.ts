import type {
  ChurchIdentitySnapshot,
  ChurchIdentitySnapshotter,
  SnapshotChurchIdentityInput,
} from '../domain/contracts/application/church-identity-snapshotter';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { ObjectStorage } from '../domain/contracts/infrastructure/object-storage';

interface DbChurchIdentitySnapshotterDependencies {
  churchRepository: Pick<ChurchRepository, 'getSettings'>;
  objectStorage: Pick<ObjectStorage, 'publicUrl'>;
}

export class DbChurchIdentitySnapshotter implements ChurchIdentitySnapshotter {
  private readonly churchRepository: DbChurchIdentitySnapshotterDependencies['churchRepository'];
  private readonly objectStorage: DbChurchIdentitySnapshotterDependencies['objectStorage'];

  constructor({
    churchRepository,
    objectStorage,
  }: DbChurchIdentitySnapshotterDependencies) {
    this.churchRepository = churchRepository;
    this.objectStorage = objectStorage;
  }

  async snapshot({
    churchId,
  }: SnapshotChurchIdentityInput): Promise<ChurchIdentitySnapshot> {
    const { logoKey, accentColor } = await this.churchRepository.getSettings({
      id: churchId,
    });
    return {
      churchLogoUrl: logoKey
        ? this.objectStorage.publicUrl({ key: logoKey })
        : null,
      churchAccent: accentColor,
    };
  }
}
