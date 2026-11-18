import { createHash } from 'node:crypto';
import { PRIMARY_WORKTREE_IDENTITY } from './worktree-identity';

export type PortService = 'server' | 'web' | 'e2eServer' | 'e2eWeb';

export type PortSet = Record<PortService, number>;

export const PORT_SERVICES: readonly PortService[] = [
  'server',
  'web',
  'e2eServer',
  'e2eWeb',
];

// The primary worktree predates allocation and keeps its established ports
// (ADR-0005); the E2E pair matches the Playwright defaults.
export const PRIMARY_PORTS: PortSet = {
  server: 3100,
  web: 3101,
  e2eServer: 4100,
  e2eWeb: 4101,
};

// Below the Linux ephemeral range (32768+), above common development ports.
const RANGE_START = 20000;
const RANGE_SIZE = 12000;

export interface PortAvailabilityInput {
  port: number;
}

export interface AllocatePortsInput {
  repository: string;
  worktree: string;
  /** Whether the port is free on the host and unclaimed by another worktree. */
  isAvailable: (input: PortAvailabilityInput) => boolean;
}

interface StartingPortInput {
  repository: string;
  worktree: string;
  service: PortService;
}

function startingPort(input: StartingPortInput): number {
  const digest = createHash('sha256')
    .update(`${input.repository}\0${input.worktree}\0${input.service}`)
    .digest();

  return RANGE_START + (digest.readUInt32BE(0) % RANGE_SIZE);
}

/**
 * Assigns each service a port: its deterministic starting port when free,
 * otherwise the next free one by linear probing (wrapping within the range).
 * Callers hold the shared allocation lock so `isAvailable` reflects every
 * other worktree's persisted claims.
 */
export function allocatePorts(input: AllocatePortsInput): PortSet {
  if (input.worktree === PRIMARY_WORKTREE_IDENTITY) {
    return { ...PRIMARY_PORTS };
  }

  const taken = new Set<number>();
  const ports = {} as PortSet;

  for (const service of PORT_SERVICES) {
    const start = startingPort({ ...input, service });
    let assigned: number | undefined;

    for (let offset = 0; offset < RANGE_SIZE; offset++) {
      const port = RANGE_START + ((start - RANGE_START + offset) % RANGE_SIZE);

      if (!taken.has(port) && input.isAvailable({ port })) {
        assigned = port;
        break;
      }
    }

    if (assigned === undefined) {
      throw new Error(
        `No free port left in ${RANGE_START}-${RANGE_START + RANGE_SIZE - 1} for the ${service} service of worktree "${input.worktree}".`,
      );
    }

    taken.add(assigned);
    ports[service] = assigned;
  }

  return ports;
}
