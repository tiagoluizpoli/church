import type { GetCallerCapabilities200 } from '@/infrastructure/api/churchAPI.schemas';
import { DEFAULT_CHURCH_ID } from '@/tests/setup/active-church';

interface CallerCapabilitiesFixtureInput {
  isChurchAdmin?: boolean;
  /** How many Ministries the caller leads; each gets a stand-in Ministry. */
  ledMinistries?: number;
  hasVolunteerMembership?: boolean;
}

/** A `getCallerCapabilities` response for one persona, defaulting to a plain Church Member. */
export function callerCapabilitiesFixture({
  isChurchAdmin = false,
  ledMinistries = 0,
  hasVolunteerMembership = false,
}: CallerCapabilitiesFixtureInput = {}): GetCallerCapabilities200 {
  return {
    churchId: DEFAULT_CHURCH_ID,
    isChurchAdmin,
    ledMinistries: Array.from({ length: ledMinistries }, (_, index) => ({
      ministryId: `ministry-${index + 1}`,
      name: `Ministry ${index + 1}`,
    })),
    hasVolunteerMembership,
  };
}
