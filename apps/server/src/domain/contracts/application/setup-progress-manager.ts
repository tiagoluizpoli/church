import type {
  GetSetupProgressInput,
  SetupProgress,
} from '@/domain/contracts/infrastructure/setup-progress.repository';

export interface ISetupProgressManager {
  getSetupProgress(input: GetSetupProgressInput): Promise<SetupProgress>;
}
