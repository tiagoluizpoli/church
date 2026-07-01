import 'reflect-metadata';
import { env } from '@church/env/server';
import { injectable } from 'tsyringe';
import { startUnleash, type Unleash } from 'unleash-client';
import type {
  FeatureFlagContext,
  IFeatureFlagService,
} from '@/domain/contracts/infrastructure/feature-flag-service';

@injectable()
export class UnleashFeatureFlagService implements IFeatureFlagService {
  private client: Unleash | null = null;
  private initPromise: Promise<void> | null = null;

  private async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = startUnleash({
      url: env.UNLEASH_API_URL,
      appName: 'church-server',
      customHeaders: { Authorization: env.UNLEASH_API_TOKEN },
    })
      .then((client) => {
        this.client = client;
      })
      .catch((err) => {
        console.warn('[unleash] Failed to connect to Unleash server:', err);
        this.client = null;
      });
    return this.initPromise;
  }

  async isEnabled(
    flagName: string,
    ctx?: FeatureFlagContext,
  ): Promise<boolean> {
    if (!this.client) {
      await this.init();
    }
    if (!this.client) return false;
    try {
      return this.client.isEnabled(
        flagName,
        ctx as Record<string, string | undefined>,
      );
    } catch {
      return false;
    }
  }

  async getAll(ctx?: FeatureFlagContext): Promise<Record<string, boolean>> {
    if (!this.client) {
      await this.init();
    }
    if (!this.client) return {};
    try {
      const toggles = this.client.getFeatureToggleDefinitions();
      const result: Record<string, boolean> = {};
      for (const toggle of toggles) {
        result[toggle.name] = this.client.isEnabled(
          toggle.name,
          ctx as Record<string, string | undefined>,
        );
      }
      return result;
    } catch {
      return {};
    }
  }
}
