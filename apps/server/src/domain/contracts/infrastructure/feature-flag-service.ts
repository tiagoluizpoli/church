export interface FeatureFlagContext {
  userId?: string;
  churchId?: string;
  [key: string]: string | undefined;
}

export interface IFeatureFlagService {
  isEnabled(flagName: string, ctx?: FeatureFlagContext): Promise<boolean>;
  getAll(ctx?: FeatureFlagContext): Promise<Record<string, boolean>>;
}
