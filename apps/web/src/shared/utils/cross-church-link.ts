/** The search param a link uses to name the Church it targets. */
export const CROSS_CHURCH_LINK_SEARCH_PARAM = 'church';

/**
 * Shown when a deep link targets a Church the caller has no Membership in.
 * Deliberately generic — it must not confirm or deny that the linked
 * resource exists in that Church (spec.md §1.5).
 */
export const CROSS_CHURCH_ACCESS_DENIED_MESSAGE =
  "That link isn't available to your account. You're still working in your current Church.";

export type CrossChurchLinkDecision =
  | { kind: 'passthrough' }
  | { kind: 'auto-select'; churchId: string }
  | { kind: 'needs-confirmation'; churchId: string }
  | { kind: 'access-denied' };

export interface ResolveCrossChurchDeepLinkInput {
  requestedChurchId: string | undefined;
  currentChurchId: string | null;
  memberChurchIds: string[];
}

/**
 * A link may name the Church it targets (`spec.md` §1.5, `active-church.NOTES.md`
 * lines 77-88). This is the seam every protected route funnels through to
 * decide what that target means relative to the caller's actual Church
 * Memberships and current Active Church — never trusting the link alone.
 */
export function resolveCrossChurchDeepLink({
  requestedChurchId,
  currentChurchId,
  memberChurchIds,
}: ResolveCrossChurchDeepLinkInput): CrossChurchLinkDecision {
  if (!requestedChurchId || requestedChurchId === currentChurchId) {
    return { kind: 'passthrough' };
  }

  if (!memberChurchIds.includes(requestedChurchId)) {
    return { kind: 'access-denied' };
  }

  return currentChurchId === null
    ? { kind: 'auto-select', churchId: requestedChurchId }
    : { kind: 'needs-confirmation', churchId: requestedChurchId };
}

export interface ExtractRequestedChurchIdInput {
  search: unknown;
}

/** An unvalidated route search object, keyed but not yet typed per-field. */
type UnvalidatedSearchRecord = Record<string, unknown>;

/**
 * Route `beforeLoad`s below `_active-church` don't all declare a
 * `validateSearch` for this param — adding one at the pathless layout would
 * strip every leaf route's own search keys (zod objects strip unknown keys
 * by default). Reading the raw, already-parsed search object defensively
 * avoids that.
 */
export function extractRequestedChurchId({
  search,
}: ExtractRequestedChurchIdInput): string | undefined {
  if (typeof search !== 'object' || search === null) return undefined;
  const value = (search as UnvalidatedSearchRecord)[
    CROSS_CHURCH_LINK_SEARCH_PARAM
  ];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export interface StripCrossChurchLinkParamInput {
  href: string;
}

const STRIP_BASE_URL = 'https://church.local';

/** Drops the `church` deep-link marker before replaying a destination. */
export function stripCrossChurchLinkParam({
  href,
}: StripCrossChurchLinkParamInput): string {
  try {
    const url = new URL(href, STRIP_BASE_URL);
    url.searchParams.delete(CROSS_CHURCH_LINK_SEARCH_PARAM);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}
