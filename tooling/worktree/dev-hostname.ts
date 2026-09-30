import { MAX_IDENTITY_LENGTH } from './worktree-identity';

/**
 * Private hostnames for manual development (ADR-0005). Each machine names its
 * own domain (`CHURCH_DEV_DOMAIN` in the machine-shared `church-shared.env`),
 * which its opt-in resolver (`bun run dns:start`) answers with this machine's
 * address; without one, worktrees fall back to `*.localhost`, which browsers
 * resolve to loopback with no setup (docs/agents/tooling.md, "Private
 * worktree URLs"). Vite accepts the controlled suffix plus the machine domain
 * from remote clients.
 */
export const DEV_HOSTNAME_SUFFIX = 'dev.home.arpa';

const LOOPBACK_DOMAIN = 'localhost';
const PROJECT_LABEL = 'church';
const LONGEST_WORKTREE_LABEL = `${PROJECT_LABEL}-`.length + MAX_IDENTITY_LENGTH;
const DNS_NAME_LIMIT = 253;
const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export interface WorktreeHostnameInput {
  /** The `[a-z0-9_]` worktree identity (see worktree-identity.ts). */
  worktree: string;
  /** This machine's `CHURCH_DEV_DOMAIN`; `localhost` when unset. */
  domain?: string;
}

/**
 * `church-<identity>.<domain>`, with underscores (not valid in a hostname)
 * as hyphens. The identity length limit keeps the label within DNS's
 * 63-character limit.
 */
export function worktreeHostname(input: WorktreeHostnameInput): string {
  return `${PROJECT_LABEL}-${input.worktree.replaceAll('_', '-')}.${input.domain ?? LOOPBACK_DOMAIN}`;
}

export interface DevDomainInput {
  domain: string;
}

/** Why `domain` cannot hold every worktree hostname; undefined when it can. */
export function describeDevDomainProblem(
  input: DevDomainInput,
): string | undefined {
  if (!input.domain.split('.').every((label) => DNS_LABEL.test(label))) {
    return `"${input.domain}" is not a lowercase DNS name (labels of a-z, 0-9 and inner hyphens, separated by single dots)`;
  }

  if (LONGEST_WORKTREE_LABEL + 1 + input.domain.length > DNS_NAME_LIMIT) {
    return `"${input.domain}" leaves no room for the longest worktree hostname within DNS's ${DNS_NAME_LIMIT}-character limit`;
  }

  return undefined;
}

export interface DevAllowedHostsInput {
  domain?: string;
}

/** Vite `allowedHosts`: the controlled suffix, plus the machine domain when
 * it falls outside it. Vite allows `localhost` names and IP literals itself. */
export function devAllowedHosts(input: DevAllowedHostsInput): string[] {
  const suffix = `.${DEV_HOSTNAME_SUFFIX}`;
  const { domain } = input;

  return domain && !`.${domain}`.endsWith(suffix)
    ? [suffix, `.${domain}`]
    : [suffix];
}
