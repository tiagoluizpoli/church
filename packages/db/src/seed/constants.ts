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
  // A fixed future CalendarDay for the one seeded day-based Event per church
  // (church-local midnight to end of day) — the #171 cutover spot-check.
  DAY_BASED_EVENT_DAY: '2026-06-20',
  DAY_BASED_EVENT_TITLE_SUFFIX: 'Day Retreat',
};
