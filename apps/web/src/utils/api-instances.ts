import { getActiveChurch } from '@/infrastructure/api/active-church';
import { getEvents } from '@/infrastructure/api/events';
import { getMinistries } from '@/infrastructure/api/ministries';
import { getPlanning } from '@/infrastructure/api/planning';
import { getRedemption } from '@/infrastructure/api/redemption';
import { getRostering } from '@/infrastructure/api/rostering';
import { getSchedulingCapability } from '@/infrastructure/api/scheduling-capability';
import { getTailoring } from '@/infrastructure/api/tailoring';
import { getVolunteer } from '@/infrastructure/api/volunteer';

const generatedVolunteerApi = getVolunteer();

export const adminApi = {
  ...getEvents(),
  ...getMinistries(),
  ...getPlanning(),
  ...getTailoring(),
  ...getRostering(),
};
export const volunteerApi = {
  ...generatedVolunteerApi,
};
export const activeChurchApi = getActiveChurch();
export const redemptionApi = getRedemption();
export const schedulingCapabilitiesApi = getSchedulingCapability();
