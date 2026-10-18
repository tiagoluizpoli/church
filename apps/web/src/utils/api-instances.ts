import { getActiveChurch } from '@/infrastructure/api/active-church';
import { getAssign } from '@/infrastructure/api/assign';
import { getCallerCapabilities } from '@/infrastructure/api/caller-capabilities';
import { getEvents } from '@/infrastructure/api/events';
import { getMinistries } from '@/infrastructure/api/ministries';
import { getPlanning } from '@/infrastructure/api/planning';
import { getPrepare } from '@/infrastructure/api/prepare';
import { getRedemption } from '@/infrastructure/api/redemption';
import { getVolunteer } from '@/infrastructure/api/volunteer';

const generatedVolunteerApi = getVolunteer();

export const adminApi = {
  ...getEvents(),
  ...getMinistries(),
  ...getPlanning(),
  ...getPrepare(),
  ...getAssign(),
};
export const volunteerApi = {
  ...generatedVolunteerApi,
};
export const activeChurchApi = getActiveChurch();
export const redemptionApi = getRedemption();
export const callerCapabilitiesApi = getCallerCapabilities();
