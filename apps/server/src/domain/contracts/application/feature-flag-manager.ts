export interface FeatureFlagContext {
  userId?: string;
  churchId?: string;
  [key: string]: string | undefined;
}

export interface IFeatureFlagManager {
  isEnabled(flagName: string, ctx?: FeatureFlagContext): Promise<boolean>;
  getAll(ctx?: FeatureFlagContext): Promise<Record<string, boolean>>;
}
