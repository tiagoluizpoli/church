import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  churchLogoKey,
  detectLogoFormat,
  isChurchLogoKey,
  LOGO_CACHE_CONTROL,
  LOGO_CONTENT_TYPE,
  LOGO_MAX_LONGEST_SIDE,
  logoDimensionRefusal,
} from '../domain/church-logo';
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
import {
  LogoBadAspectRatioError,
  LogoKeyInvalidError,
  LogoTooLargeError,
  LogoTooSmallError,
  LogoUnsupportedTypeError,
} from '../domain/errors/church-logo';

interface DbChurchSettingsManagerDependencies {
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
  objectStorage: ObjectStorage;
  /** The web app's origin, under which the public Church page lives. */
  publicOrigin: string;
}

interface NormaliseLogoInput {
  bytes: Uint8Array;
}

/** Decodes (sharp's pixel limit on), checks the rules and returns one ≤512 px PNG without metadata. */
async function normaliseLogo({ bytes }: NormaliseLogoInput): Promise<Buffer> {
  if (!detectLogoFormat({ bytes })) throw new LogoUnsupportedTypeError();
  let width: number;
  let height: number;
  try {
    ({ width, height } = await sharp(bytes).metadata());
  } catch (error) {
    if (String(error).includes('pixel limit')) throw new LogoTooLargeError();
    throw new LogoUnsupportedTypeError();
  }
  const refusal = logoDimensionRefusal({ width, height });
  if (refusal === 'LOGO_TOO_SMALL') throw new LogoTooSmallError();
  if (refusal === 'LOGO_BAD_ASPECT_RATIO') throw new LogoBadAspectRatioError();
  try {
    return await sharp(bytes)
      .autoOrient()
      .resize({
        width: LOGO_MAX_LONGEST_SIDE,
        height: LOGO_MAX_LONGEST_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch (error) {
    if (String(error).includes('pixel limit')) throw new LogoTooLargeError();
    throw new LogoUnsupportedTypeError();
  }
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
    const png = await normaliseLogo({ bytes });
    const sha256 = createHash('sha256').update(png).digest('hex');
    const key = churchLogoKey({ churchId, sha256 });
    // Same bytes, same key: re-putting it stores identical content, never a new object.
    await this.objectStorage.put({
      key,
      body: png,
      contentType: LOGO_CONTENT_TYPE,
      cacheControl: LOGO_CACHE_CONTROL,
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
