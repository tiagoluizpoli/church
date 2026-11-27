import type {
  GetSetupProgressInput,
  SetupProgress,
  SetupProgressRepository,
} from '@/domain/contracts/infrastructure/setup-progress.repository';

export interface ISetupProgressManager {
  getSetupProgress(input: GetSetupProgressInput): Promise<SetupProgress>;
}

export interface DbSetupProgressManagerDependencies {
  setupProgressRepository: SetupProgressRepository;
}
