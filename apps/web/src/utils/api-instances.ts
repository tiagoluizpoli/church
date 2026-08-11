import { getActiveChurch } from '@/infrastructure/api/active-church';
import { getAdmin } from '@/infrastructure/api/admin';
import { getFeatureFlags as createFeatureFlagsApi } from '@/infrastructure/api/feature-flags';
import { getRedemption } from '@/infrastructure/api/redemption';
import { getVolunteer } from '@/infrastructure/api/volunteer';

interface LegacyCreateEventBody {
  ministryId: string;
  title: string;
  description?: string;
  location?: string;
  startDate: string;
  endDate: string;
  eventType?: 'hourly' | 'day_based';
}

interface LegacyCreateEventResult {
  id: string;
}

interface LegacyRoleTemplateSummary {
  id: string;
  name: string;
}

interface LegacyRoleTemplateListResult {
  items: LegacyRoleTemplateSummary[];
}

const generatedAdminApi = getAdmin();
const generatedVolunteerApi = getVolunteer();

export const adminApi = {
  ...generatedAdminApi,
  async createEvent(
    _body: LegacyCreateEventBody,
  ): Promise<LegacyCreateEventResult> {
    throw new Error('Quick create is not available on the current admin API.');
  },
  async publishEvent(_eventId: string): Promise<void> {},
  async listRoleTemplates(): Promise<LegacyRoleTemplateListResult> {
    return { items: [] };
  },
};
export const volunteerApi = {
  ...generatedVolunteerApi,
};
export const featureFlagsApi = createFeatureFlagsApi();
export const activeChurchApi = getActiveChurch();
export const redemptionApi = getRedemption();
