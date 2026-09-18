import { getActiveChurch } from '@/infrastructure/api/active-church';
import { getAssignments } from '@/infrastructure/api/assignments';
import { getEvents } from '@/infrastructure/api/events';
import { getFeatureFlags as createFeatureFlagsApi } from '@/infrastructure/api/feature-flags';
import { getMinistries } from '@/infrastructure/api/ministries';
import { getPlanning } from '@/infrastructure/api/planning';
import { getRedemption } from '@/infrastructure/api/redemption';
import { getRostering } from '@/infrastructure/api/rostering';
import { getTailoring } from '@/infrastructure/api/tailoring';
import { getTimeSlots } from '@/infrastructure/api/time-slots';
import { getVolunteer } from '@/infrastructure/api/volunteer';

interface LegacyCreateEventBody {
  ministryId: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
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

const generatedVolunteerApi = getVolunteer();

export const adminApi = {
  ...getEvents(),
  ...getTimeSlots(),
  ...getAssignments(),
  ...getMinistries(),
  ...getPlanning(),
  ...getTailoring(),
  ...getRostering(),
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
