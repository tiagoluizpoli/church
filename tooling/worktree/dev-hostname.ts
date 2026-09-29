/**
 * Private hostnames for manual development (ADR-0005). One wildcard DNS rule
 * maps every name under the suffix to the homelab server's Tailscale address,
 * and one Tailscale split-DNS rule delegates the suffix to that resolver
 * (docs/agents/tooling.md, "Private worktree URLs"). Vite accepts only this
 * suffix from remote clients.
 */
export const DEV_HOSTNAME_SUFFIX = 'dev.home.arpa';

const PROJECT_LABEL = 'church';

export interface WorktreeHostnameInput {
  /** The `[a-z0-9_]` worktree identity (see worktree-identity.ts). */
  worktree: string;
}

/**
 * `church-<identity>.dev.home.arpa`, with underscores (not valid in a
 * hostname) as hyphens. The identity length limit keeps the label within
 * DNS's 63-character limit.
 */
export function worktreeHostname(input: WorktreeHostnameInput): string {
  return `${PROJECT_LABEL}-${input.worktree.replaceAll('_', '-')}.${DEV_HOSTNAME_SUFFIX}`;
}
