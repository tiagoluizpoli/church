import { getAdmin } from '@/infrastructure/api/admin';
import { getFeatureFlags as createFeatureFlagsApi } from '@/infrastructure/api/feature-flags';
import { getVolunteer } from '@/infrastructure/api/volunteer';

export const adminApi = getAdmin();
export const volunteerApi = getVolunteer();
export const featureFlagsApi = createFeatureFlagsApi();
