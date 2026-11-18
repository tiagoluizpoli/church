import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';

/**
 * Resolves the real web Vite config the way `vite` does and reads the
 * `Host` names its dev server accepts, with this machine's domain arriving
 * as `env:local` provides it to Vite's environment loading.
 */

const WEB_ROOT = resolve(import.meta.dir, '../../../apps/web');

interface AllowedHostsInput {
  devDomain?: string;
}

function resolvedAllowedHosts(input: AllowedHostsInput): unknown {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CHURCH_DEV_DOMAIN;
  if (input.devDomain) env.CHURCH_DEV_DOMAIN = input.devDomain;

  const result = spawnSync(
    'bun',
    [
      '-e',
      "const { resolveConfig } = await import('vite'); const config = await resolveConfig({}, 'serve'); console.log(JSON.stringify(config.server.allowedHosts));",
    ],
    { cwd: WEB_ROOT, encoding: 'utf8', env },
  );
  expect(result.status, result.stderr).toBe(0);

  return JSON.parse(result.stdout.trim().split('\n').at(-1) ?? 'null');
}

describe('web dev server allowedHosts', () => {
  it("adds this machine's domain outside the controlled suffix", () => {
    expect(
      resolvedAllowedHosts({ devDomain: 'laptop.example.internal' }),
    ).toEqual(['.dev.home.arpa', '.laptop.example.internal']);
  });

  it('keeps only the controlled suffix for a domain under it', () => {
    expect(resolvedAllowedHosts({ devDomain: 'laptop.dev.home.arpa' })).toEqual(
      ['.dev.home.arpa'],
    );
  });
});
