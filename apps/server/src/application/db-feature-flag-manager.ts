import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  FeatureFlagContext,
  IFeatureFlagManager,
} from '../domain/contracts/application/feature-flag-manager';
import type { IFeatureFlagService } from '../domain/contracts/infrastructure/feature-flag-service';

@injectable()
export class DbFeatureFlagManager implements IFeatureFlagManager {
  constructor(
    @inject('IFeatureFlagService')
    private readonly featureFlagService: IFeatureFlagService,
  ) {}

  async isEnabled(
    flagName: string,
    ctx?: FeatureFlagContext,
  ): Promise<boolean> {
    return this.featureFlagService.isEnabled(flagName, ctx);
  }

  async getAll(ctx?: FeatureFlagContext): Promise<Record<string, boolean>> {
    return this.featureFlagService.getAll(ctx);
  }
}
