export const SEED_CONFIG = {
  GLOBAL_SEED: 12345,
  CHURCH_COUNT: 3,
  VOLUNTEERS_PER_CHURCH: 15,
  MINISTRIES_PER_CHURCH: ['Worship', 'Kids', 'Tech', 'Hospitality'],
  MINISTRY_ROLES: {
    Worship: ['Leader', 'Guitarist', 'Vocalist', 'Pianist'],
    Kids: ['Teacher', 'Assistant'],
    Tech: ['Sound', 'Visuals', 'Camera'],
    Hospitality: ['Greeter', 'Usher'],
  } as Record<string, string[]>,
  EVENTS_PER_MINISTRY: {
    PAST: 2,
    FUTURE: 6,
  },
  DEFAULT_LOCATION: 'Main Sanctuary',
  REFERENCE_DATE: '2026-05-01T00:00:00Z',
};
