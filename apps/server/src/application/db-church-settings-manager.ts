import { isChurchLogoKey } from '../domain/church-logo';
import type {
  ChurchSettingsView,
  GetChurchSettingsInput,
  IChurchSettingsManager,
  RestoreChurchLogoInput,
  UpdateChurchSettingsInput,
  UploadChurchLogoInput,
} from '../domain/contracts/application/church-settings-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { ObjectStorage } from '../domain/contracts/infrastructure/object-storage';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import { LogoKeyInvalidError } from '../domain/errors/church-logo';
import { storeChurchLogo } from './church-logo-pipeline';

interface DbChurchSettingsManagerDependencies {
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
  objectStorage: ObjectStorage;
  /** The web app's origin, under which the public Church page lives. */
  publicOrigin: string;
}

export class DbChurchSettingsManager implements IChurchSettingsManager {
  private readonly churchRepository: ChurchRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly objectStorage: ObjectStorage;
  private readonly publicOrigin: string;

  constructor({
    churchRepository,
    unitOfWork,
    objectStorage,
    publicOrigin,
  }: DbChurchSettingsManagerDependencies) {
    this.churchRepository = churchRepository;
    this.unitOfWork = unitOfWork;
    this.objectStorage = objectStorage;
    this.publicOrigin = publicOrigin.replace(/\/+$/, '');
  }

  async getChurchSettings({
    churchId,
  }: GetChurchSettingsInput): Promise<ChurchSettingsView> {
    const settings = await this.churchRepository.getSettings({ id: churchId });
    return {
      ...settings,
      logoUrl: settings.logoKey
        ? this.objectStorage.publicUrl({ key: settings.logoKey })
        : null,
      publicOrigin: this.publicOrigin,
    };
  }

  async updateChurchSettings({
    churchId,
    changes,
  }: UpdateChurchSettingsInput): Promise<ChurchSettingsView> {
    await this.unitOfWork.run((tx) =>
      this.churchRepository.saveSettings({ id: churchId, changes, tx }),
    );
    return this.getChurchSettings({ churchId });
  }

  async uploadLogo({
    churchId,
    bytes,
  }: UploadChurchLogoInput): Promise<ChurchSettingsView> {
    const key = await storeChurchLogo({
      objectStorage: this.objectStorage,
      churchId,
      bytes,
    });
    await this.churchRepository.saveLogoKey({ id: churchId, logoKey: key });
    return this.getChurchSettings({ churchId });
  }

  async removeLogo({
    churchId,
  }: GetChurchSettingsInput): Promise<ChurchSettingsView> {
    await this.churchRepository.saveLogoKey({ id: churchId, logoKey: null });
    return this.getChurchSettings({ churchId });
  }

  async restoreLogo({
    churchId,
    key,
  }: RestoreChurchLogoInput): Promise<ChurchSettingsView> {
    if (!isChurchLogoKey({ churchId, key })) throw new LogoKeyInvalidError();
    await this.churchRepository.saveLogoKey({ id: churchId, logoKey: key });
    return this.getChurchSettings({ churchId });
  }
}
