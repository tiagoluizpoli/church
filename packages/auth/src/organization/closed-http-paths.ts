/**
 * Organization routes the app deliberately calls over HTTP. None today: the
 * web client registers `organizationClient()` only for session typing, and the
 * server reaches the plugin through its trusted `auth.api.*` calls, which never
 * traverse the router. Membership data and changes go through the app's own
 * API, behind its single gatekeeper (ADR 0009).
 */
export const organizationHttpAllowlist: readonly string[] = [];

export interface OrganizationEndpoint {
  /** Absent on server-only endpoints, such as `addMember`. */
  path?: string;
}

export interface ClosedOrganizationPathsInput {
  endpoints: Record<string, OrganizationEndpoint>;
}

/**
 * Every HTTP path the organization plugin registers, minus the allowlist.
 * Derived from the plugin itself, so a route a Better Auth upgrade adds is
 * closed until the app chooses to call it.
 */
export function closedOrganizationPaths({
  endpoints,
}: ClosedOrganizationPathsInput): string[] {
  return Object.values(endpoints)
    .map((endpoint) => endpoint.path)
    .filter(
      (path): path is string =>
        path !== undefined && !organizationHttpAllowlist.includes(path),
    )
    .sort();
}
