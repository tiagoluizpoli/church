import { type Browser, chromium } from '@playwright/test';
import { worktreeHostname } from '../worktree/dev-hostname';
import {
  readGeneratedPorts,
  readGeneratedWorktreeIdentity,
  worktreeContext,
} from '../worktree/local-env';
import type { PortSet } from '../worktree/port-allocation';
import { readSharedValues, sharedDevDomain } from '../worktree/shared-values';

/** Where the sign-in page is reached from, and with which browser. */

export interface DevTarget {
  root: string;
  ports: PortSet;
  /** `http://church-<worktree>.<domain>:<web port>`, the API's CORS origin. */
  webOrigin: string;
}

interface CwdInput {
  cwd: string;
}

export function devTarget(input: CwdInput): DevTarget {
  const { root, commonDir } = worktreeContext(input);
  const worktree = readGeneratedWorktreeIdentity(input);
  const ports = readGeneratedPorts(input);
  if (!worktree || !ports) {
    throw new Error('No generated .env.local. Run `bun run env:local` first.');
  }

  const shared = readSharedValues({ commonDir });
  const domain = sharedDevDomain({ shared });
  const host = worktreeHostname({ worktree, domain });

  return { root, ports, webOrigin: `http://${host}:${ports.web}` };
}

export interface LaunchSystemChromeInput {
  /** Opens a window and draws on the GPU; headless Chrome draws in software. */
  headed: boolean;
}

/** The installed Google Chrome, not Playwright's bundled headless shell. */
export function launchSystemChrome(
  input: LaunchSystemChromeInput,
): Promise<Browser> {
  return chromium.launch({ channel: 'chrome', headless: !input.headed });
}
