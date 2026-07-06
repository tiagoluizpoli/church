import 'reflect-metadata';
import { env } from '@church/env/server';
import { injectable } from 'tsyringe';
import { startUnleash, type Unleash } from 'unleash-client';
import type {
  FeatureFlagContext,
  IFeatureFlagService,
} from '@/domain/contracts/infrastructure/feature-flag-service';

const REACHABILITY_TIMEOUT_MS = 2_000;

// unleash-client's polling fetcher can crash the whole process on connection
// errors (an unhandled 'error' event on the underlying request, bypassing its
// own error-event plumbing) instead of rejecting cleanly. Probing reachability
// ourselves with the native fetch first means we never hand the server to
// startUnleash()'s retrying client when it can't be reached, sidestepping that
// crash path entirely instead of relying on the SDK's own error handling.
async function isReachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(REACHABILITY_TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  }
}

@injectable()
export class UnleashFeatureFlagService implements IFeatureFlagService {
  private client: Unleash | null = null;
  private initPromise: Promise<void> | null = null;

  private async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      if (!(await isReachable(env.UNLEASH_API_URL))) {
        console.warn(
          `[unleash] ${env.UNLEASH_API_URL} is unreachable; feature flags will default to disabled.`,
        );
        this.client = null;
        this.initPromise = null; // allow retry on next call
        return;
      }

      try {
        this.client = await startUnleash({
          url: env.UNLEASH_API_URL,
          appName: 'church-server',
          customHeaders: { Authorization: env.UNLEASH_API_TOKEN },
        });
      } catch (err) {
        console.warn('[unleash] Failed to connect to Unleash server:', err);
        this.client = null;
        this.initPromise = null; // allow retry on next call
      }
    })();
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
