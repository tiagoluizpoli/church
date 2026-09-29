import { describe, expect, it } from 'bun:test';
import { allocatePorts } from '../../worktree/port-allocation';

const REPOSITORY = 'church';
const WORKTREE = 'feature_foo';

// Worked example: 20000 + (first 8 hex of sha256("church\0feature_foo\0<service>")
// as an unsigned integer) mod 12000.
const FEATURE_FOO_STARTS = {
  server: 27520,
  web: 21187,
  e2eServer: 25081,
  e2eWeb: 26409,
};

const everyPortFree = (): boolean => true;

describe('allocatePorts', () => {
  it('starts each service at a port derived from repository, worktree and service', () => {
    expect(
      allocatePorts({
        repository: REPOSITORY,
        worktree: WORKTREE,
        isAvailable: everyPortFree,
      }),
    ).toEqual(FEATURE_FOO_STARTS);
  });

  it('gives different worktrees different starting ports', () => {
    const other = allocatePorts({
      repository: REPOSITORY,
      worktree: 'feature_bar',
      isAvailable: everyPortFree,
    });

    expect(other.server).not.toBe(FEATURE_FOO_STARTS.server);
    expect(other.web).not.toBe(FEATURE_FOO_STARTS.web);
  });

  it('probes linearly past occupied ports', () => {
    const occupied = new Set([27520, 27521, 21187]);

    expect(
      allocatePorts({
        repository: REPOSITORY,
        worktree: WORKTREE,
        isAvailable: ({ port }) => !occupied.has(port),
      }),
    ).toEqual({ ...FEATURE_FOO_STARTS, server: 27522, web: 21188 });
  });

  it('wraps around to the start of the range', () => {
    const ports = allocatePorts({
      repository: REPOSITORY,
      worktree: WORKTREE,
      isAvailable: ({ port }) => port < 21000,
    });

    expect(ports.server).toBe(20000);
  });

  it('never assigns one port to two services of the same worktree', () => {
    const ports = allocatePorts({
      repository: REPOSITORY,
      worktree: WORKTREE,
      isAvailable: ({ port }) => port >= 20000 && port < 20004,
    });

    expect(new Set(Object.values(ports))).toEqual(
      new Set([20000, 20001, 20002, 20003]),
    );
  });

  it('fails when the range has no free port left', () => {
    expect(() =>
      allocatePorts({
        repository: REPOSITORY,
        worktree: WORKTREE,
        isAvailable: () => false,
      }),
    ).toThrow(/No free port/);
  });

  it('keeps the primary worktree on its established ports', () => {
    expect(
      allocatePorts({
        repository: REPOSITORY,
        worktree: 'develop',
        isAvailable: () => false,
      }),
    ).toEqual({ server: 3100, web: 3101, e2eServer: 4100, e2eWeb: 4101 });
  });
});
