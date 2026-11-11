export type HomeSection = 'church' | 'leadership' | 'serving';

/** Root of every Home section read. Church switches already clear it (any non-`active-church` key). */
export const HOME_QUERY_KEY = ['home'] as const;

interface HomeSectionQueryKeyInput {
  section: HomeSection;
  churchId: string;
  userId: string;
  /** Further discriminators, e.g. a filter. */
  parts?: readonly unknown[];
}

/**
 * Invalidation contract for Home section reads: every query a section issues
 * MUST use this key. `Home` removes `homeSectionQueryKey({ section, ... })`
 * entries (prefix match) when the section's capacity is lost, and a Church
 * switch clears them with the rest of the Church-scoped cache.
 */
export function homeSectionQueryKey({
  section,
  churchId,
  userId,
  parts = [],
}: HomeSectionQueryKeyInput) {
  return [...HOME_QUERY_KEY, section, churchId, userId, ...parts] as const;
}

/** Prefix matching every cached read of `section`, in any Church or for any user. */
interface HomeSectionQueryPrefixInput {
  section: HomeSection;
}

export function homeSectionQueryPrefix({
  section,
}: HomeSectionQueryPrefixInput) {
  return [...HOME_QUERY_KEY, section] as const;
}
