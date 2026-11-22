import type {
  ChurchSettingsView,
  GetChurchSettingsInput,
  IChurchSettingsManager,
  UpdateChurchSettingsInput,
} from '../domain/contracts/application/church-settings-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';

interface DbChurchSettingsManagerDependencies {
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
  /** The web app's origin, under which the public Church page lives. */
  publicOrigin: string;
}

export class DbChurchSettingsManager implements IChurchSettingsManager {
  private readonly churchRepository: ChurchRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly publicOrigin: string;

  constructor({
    churchRepository,
    unitOfWork,
    publicOrigin,
  }: DbChurchSettingsManagerDependencies) {
    this.churchRepository = churchRepository;
    this.unitOfWork = unitOfWork;
    this.publicOrigin = publicOrigin.replace(/\/+$/, '');
  }

  async getChurchSettings({
    churchId,
  }: GetChurchSettingsInput): Promise<ChurchSettingsView> {
    const settings = await this.churchRepository.getSettings({ id: churchId });
    return { ...settings, publicOrigin: this.publicOrigin };
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
}
