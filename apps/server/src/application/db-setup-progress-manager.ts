import type { ISetupProgressManager } from '../domain/contracts/application/setup-progress-manager';
import type {
  GetSetupProgressInput,
  SetupProgress,
  SetupProgressRepository,
} from '../domain/contracts/infrastructure/setup-progress.repository';

interface DbSetupProgressManagerDependencies {
  setupProgressRepository: SetupProgressRepository;
}

export class DbSetupProgressManager implements ISetupProgressManager {
  private readonly setupProgressRepository: SetupProgressRepository;

  constructor({ setupProgressRepository }: DbSetupProgressManagerDependencies) {
    this.setupProgressRepository = setupProgressRepository;
  }

  getSetupProgress(input: GetSetupProgressInput): Promise<SetupProgress> {
    return this.setupProgressRepository.get(input);
  }
}
