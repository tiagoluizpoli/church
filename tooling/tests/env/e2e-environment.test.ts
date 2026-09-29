import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  applyE2eUrlSet,
  assertE2eEnvironment,
  assertE2eProcessEnvironment,
  deriveE2eUrlSet,
  resolveE2eTargetFingerprint,
  serverProcessEnv,
  webProcessEnv,
} from '../../env/e2e-environment';

const E2E_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/church_unspecified_e2e';

const ENV_KEYS = [
  'CHURCH_EXEC_PURPOSE',
  'CHURCH_WORKTREE',
  'CHURCH_E2E_TARGET_FINGERPRINT',
  'PORT',
  'DATABASE_URL',
  'VITE_SERVER_URL',
  'PW_WEB_URL',
  'PW_SERVER_PORT',
  'PW_WEB_PORT',
  'CORS_ORIGIN',
  'BETTER_AUTH_URL',
] as const;

type SavedEnv = Record<string, string | undefined>;

const saved: SavedEnv = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('deriveE2eUrlSet', () => {
  it('stays on loopback whatever host the manual VITE_SERVER_URL names', () => {
    const urlSet = deriveE2eUrlSet({
      env: { VITE_SERVER_URL: 'http://church-feature-a.dev.home.arpa:27520' },
    });

    expect(urlSet.serverUrl).toBe('http://localhost:4100');
    expect(urlSet.webUrl).toBe('http://localhost:4101');
  });

  it('honours PW_SERVER_PORT and PW_WEB_PORT overrides', () => {
    const urlSet = deriveE2eUrlSet({
      env: { PW_SERVER_PORT: '5100', PW_WEB_PORT: '5101' },
    });

    expect(urlSet.serverUrl).toBe('http://localhost:5100');
    expect(urlSet.webUrl).toBe('http://localhost:5101');
  });
});

describe('process environments', () => {
  const urlSet = deriveE2eUrlSet({ env: {} });

  it('gives the server its port, trusted origin, auth URL, and the e2e purpose', () => {
    expect(serverProcessEnv({ urlSet })).toEqual({
      CHURCH_EXEC_PURPOSE: 'e2e',
      PORT: '4100',
      CORS_ORIGIN: 'http://localhost:4101',
      BETTER_AUTH_URL: 'http://localhost:4100',
    });
  });

  it('gives the web app its port, server URL, and the e2e purpose', () => {
    expect(webProcessEnv({ urlSet })).toEqual({
      CHURCH_EXEC_PURPOSE: 'e2e',
      PORT: '4101',
      VITE_SERVER_URL: 'http://localhost:4100',
    });
  });
});

describe('assertE2eEnvironment', () => {
  function arrangeCoherentEnvironment(): void {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    applyE2eUrlSet({
      env: process.env,
      urlSet: deriveE2eUrlSet({ env: process.env }),
    });
  }

  it('passes and reports the target fingerprint for a coherent environment', () => {
    arrangeCoherentEnvironment();
    const log = spyOn(console, 'log').mockImplementation(() => {});

    assertE2eEnvironment();

    expect(log).toHaveBeenCalledWith(
      'purpose=e2e worktree=unspecified host=localhost port=5432 database=church_unspecified_e2e',
    );
    log.mockRestore();
  });

  it('rejects a URL that disagrees with the run before touching the database', () => {
    arrangeCoherentEnvironment();
    process.env.CORS_ORIGIN = 'http://localhost:4001';

    expect(() => assertE2eEnvironment()).toThrow(/CORS_ORIGIN/);
  });

  it('rejects a run outside the e2e purpose', () => {
    arrangeCoherentEnvironment();
    process.env.CHURCH_EXEC_PURPOSE = 'development';

    expect(() => assertE2eEnvironment()).toThrow(/CHURCH_EXEC_PURPOSE=e2e/);
  });

  it('rejects a database target that is not the e2e database', () => {
    arrangeCoherentEnvironment();
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/church';

    expect(() => assertE2eEnvironment()).toThrow(/church/);
  });
});

describe('assertE2eProcessEnvironment', () => {
  const FINGERPRINT =
    'purpose=e2e worktree=unspecified host=localhost port=5432 database=church_unspecified_e2e';

  function arrangeRun(): void {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = E2E_DATABASE_URL;
    applyE2eUrlSet({
      env: process.env,
      urlSet: deriveE2eUrlSet({ env: process.env }),
    });
    process.env.CHURCH_E2E_TARGET_FINGERPRINT = resolveE2eTargetFingerprint();
  }

  it('resolves the redacted fingerprint the run pins for every process', () => {
    process.env.CHURCH_EXEC_PURPOSE = 'e2e';
    process.env.DATABASE_URL = E2E_DATABASE_URL;

    expect(resolveE2eTargetFingerprint()).toBe(FINGERPRINT);
  });

  it('passes for a server process that shares the run fingerprint and ports', () => {
    arrangeRun();
    process.env.PORT = '4100';
    const log = spyOn(console, 'log').mockImplementation(() => {});

    expect(() => assertE2eProcessEnvironment({ role: 'server' })).not.toThrow();
    log.mockRestore();
  });

  it('rejects a process that resolved a different database than the run', () => {
    arrangeRun();
    process.env.PORT = '4101';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/church_other_e2e';
    process.env.CHURCH_WORKTREE = 'other';
    const log = spyOn(console, 'log').mockImplementation(() => {});

    expect(() => assertE2eProcessEnvironment({ role: 'web' })).toThrow(
      /fingerprint/i,
    );
    log.mockRestore();
  });

  it('rejects a process bound to a port outside its role in the URL set', () => {
    arrangeRun();
    process.env.PORT = '4000';

    expect(() => assertE2eProcessEnvironment({ role: 'server' })).toThrow(
      /PORT/,
    );
  });

  it('rejects a process launched without the run fingerprint', () => {
    arrangeRun();
    process.env.PORT = '4100';
    delete process.env.CHURCH_E2E_TARGET_FINGERPRINT;

    expect(() => assertE2eProcessEnvironment({ role: 'server' })).toThrow(
      /CHURCH_E2E_TARGET_FINGERPRINT/,
    );
  });
});
