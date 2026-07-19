export const PARTICIPATION_DEFAULT_ALL_IN_FLAG = 'PARTICIPATION_DEFAULT_ALL_IN';
export const VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE_FLAG =
  'VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE';
export const EVENT_BUILDER_MINISTRY_ONLY_FAIRNESS_FLAG =
  'EVENT_BUILDER_MINISTRY_ONLY_FAIRNESS';

export interface FeatureFlagContext {
  userId?: string;
  churchId?: string;
  [key: string]: string | undefined;
}

export interface IFeatureFlagService {
  isEnabled(flagName: string, ctx?: FeatureFlagContext): Promise<boolean>;
  getAll(ctx?: FeatureFlagContext): Promise<Record<string, boolean>>;
}
