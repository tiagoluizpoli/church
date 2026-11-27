import { formatChurchLocality } from '../domain/church-locality';
import type {
  ChurchIdentitySnapshot,
  DbChurchIdentitySnapshotterDependencies,
  IChurchIdentitySnapshotter,
  SnapshotChurchIdentityInput,
} from '../domain/contracts/application/church-identity-snapshotter';
import { churchLogoUrl } from './church-logo-url';

export class DbChurchIdentitySnapshotter implements IChurchIdentitySnapshotter {
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
    tx,
  }: SnapshotChurchIdentityInput): Promise<ChurchIdentitySnapshot> {
    const { logoKey, accentColor, addresses } =
      await this.churchRepository.getSettings({
        id: churchId,
        tx,
      });
    const churchLocality = formatChurchLocality(
      addresses.find((address) => address.isMain),
    );
    return {
      churchLogoUrl: churchLogoUrl({
        objectStorage: this.objectStorage,
        logoKey,
      }),
      churchAccent: accentColor,
      ...(churchLocality ? { churchLocality } : {}),
    };
  }
}
