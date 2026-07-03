import type {
  FeatureFlagContext,
  IFeatureFlagService,
} from '../domain/contracts/infrastructure/feature-flag-service';

export const PARTICIPATION_DEFAULT_ALL_IN = 'PARTICIPATION_DEFAULT_ALL_IN';
export const VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE =
  'VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE';

export interface SchedulingFeatureFlagServiceStubOptions {
  participationDefaultAllIn: boolean;
  volunteerDashboardAllowOverlapSave: boolean;
}

export class SchedulingFeatureFlagServiceStub implements IFeatureFlagService {
  private readonly flags: Record<string, boolean>;

  constructor({
    participationDefaultAllIn,
    volunteerDashboardAllowOverlapSave,
  }: SchedulingFeatureFlagServiceStubOptions) {
    this.flags = {
      [PARTICIPATION_DEFAULT_ALL_IN]: participationDefaultAllIn,
      [VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE]:
        volunteerDashboardAllowOverlapSave,
    };
  }

  async isEnabled(
    flagName: string,
    _context?: FeatureFlagContext,
  ): Promise<boolean> {
    return this.flags[flagName] ?? false;
  }

  async getAll(
    _context?: FeatureFlagContext,
  ): Promise<Record<string, boolean>> {
    return { ...this.flags };
  }
}
