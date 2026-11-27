import { NotFoundError } from '@church/core';
import { churchSlugRefusal } from '@church/domain-rules/church-slug';
import type { ChurchAddressUsage } from '../domain/church-address';
import { isChurchLogoKey } from '../domain/church-logo';
import type { ChurchSlugAvailability } from '../domain/church-settings';
import type {
  ChurchSettingsView,
  DbChurchSettingsManagerDependencies,
  GetChurchAddressUsageInput,
  GetChurchSettingsInput,
  IChurchSettingsManager,
  RestoreChurchLogoInput,
  SlugAvailabilityInput,
  UpdateChurchSettingsInput,
  UploadChurchLogoInput,
} from '../domain/contracts/application/church-settings-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { ObjectStorage } from '../domain/contracts/infrastructure/object-storage';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import { LogoKeyInvalidError } from '../domain/errors/church-logo';
import { storeChurchLogo } from './church-logo-pipeline';
import { churchLogoUrl } from './church-logo-url';

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
      logoUrl: churchLogoUrl({
        objectStorage: this.objectStorage,
        logoKey: settings.logoKey,
      }),
      publicOrigin: this.publicOrigin,
    };
  }

  async getAddressUsage({
    churchId,
    addressId,
  }: GetChurchAddressUsageInput): Promise<ChurchAddressUsage> {
    const usage = await this.churchRepository.getAddressUsage({
      id: churchId,
      addressId,
    });
    if (!usage)
      throw new NotFoundError(`Church Address not found: ${addressId}`);
    return usage;
  }

  async getSlugAvailability({
    churchId,
    slug,
  }: SlugAvailabilityInput): Promise<ChurchSlugAvailability> {
    const refusal = churchSlugRefusal(slug);
    if (refusal === 'RESERVED') return 'reserved';
    if (refusal) return 'invalid';
    return this.churchRepository.slugAvailability({ id: churchId, slug });
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
    // A key whose object is gone would serve a 404 the edge then caches.
    const restorable =
      isChurchLogoKey({ churchId, key }) &&
      (await this.objectStorage.exists({ key }));
    if (!restorable) throw new LogoKeyInvalidError();
    await this.churchRepository.saveLogoKey({ id: churchId, logoKey: key });
    return this.getChurchSettings({ churchId });
  }
}
