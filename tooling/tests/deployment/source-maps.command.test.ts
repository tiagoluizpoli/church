import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ROOT } from '../env/ci-workflow';

/**
 * #929: runs the real release source-map step against a scratch web build,
 * with a stand-in `sentry-cli` on PATH (the process boundary) that records
 * each call and fails on demand. No tracker runs.
 */

const SCRIPT = resolve(import.meta.dir, '../../deployment/source-maps.ts');
const REVISION = 'a'.repeat(40);
const TOKEN = 'sntrys_secret-token-value';
const SETTINGS = {
  SENTRY_URL: 'https://tracker.example.test',
  SENTRY_ORG: 'church',
  SENTRY_PROJECT: 'church-web',
  SENTRY_AUTH_TOKEN: TOKEN,
};

let workDir: string;
let dist: string;
let stubDir: string;
let callLog: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'source-maps-'));
  dist = join(workDir, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  for (const file of ['assets/index-abc.js', 'assets/route-def.js', 'sw.js']) {
    writeFileSync(join(dist, file), 'console.log(1);\n');
    writeFileSync(join(dist, `${file}.map`), '{"version":3}');
  }
  writeFileSync(join(dist, 'index.html'), '<!doctype html>');
  stubDir = join(workDir, 'bin');
  mkdirSync(stubDir);
  callLog = join(workDir, 'calls.log');
  // One line per call: its arguments, then whether the token came by env.
  writeFileSync(
    join(stubDir, 'sentry-cli'),
    `#!/bin/sh
printf '%s|token=%s\\n' "$*" "$([ -n "$SENTRY_AUTH_TOKEN" ] && echo env)" >> "${callLog}"
[ "$1" = "$FAIL_ON" ] && exit 1
exit 0
`,
  );
  chmodSync(join(stubDir, 'sentry-cli'), 0o755);
});

afterEach(() => rmSync(workDir, { recursive: true, force: true }));

interface RunInput {
  env?: Record<string, string>;
  revision?: string;
}

function run({ env = SETTINGS, revision = REVISION }: RunInput = {}) {
  const result = Bun.spawnSync(
    ['bun', SCRIPT, `--dist=${dist}`, `--revision=${revision}`],
    {
      env: {
        PATH: `${stubDir}:${process.env.PATH}`,
        HOME: workDir,
        ...env,
      },
    },
  );
  return {
    exitCode: result.exitCode,
    output: `${result.stdout}${result.stderr}`,
  };
}

const calls = () =>
  existsSync(callLog) ? readFileSync(callLog, 'utf8').trim().split('\n') : [];

const maps = () =>
  readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('.map'),
  );

describe('release source maps', () => {
  it('uploads the maps under the revision, then removes them from the served output', () => {
    const { exitCode, output } = run();

    expect(exitCode).toBe(0);
    expect(calls()).toEqual([
      `releases new ${REVISION}|token=env`,
      `sourcemaps upload --release=${REVISION} --url-prefix=~/ --strict --validate ${dist}|token=env`,
    ]);
    expect(maps()).toEqual([]);
    expect(existsSync(join(dist, 'assets/index-abc.js'))).toBe(true);
    expect(output).not.toContain(TOKEN);
  });

  it('fails the step when the upload fails, still leaving no map behind', () => {
    const { exitCode, output } = run({
      env: { ...SETTINGS, FAIL_ON: 'sourcemaps' },
    });

    expect(exitCode).toBe(1);
    expect(output).toContain('Source map upload failed');
    expect(maps()).toEqual([]);
    expect(output).not.toContain(TOKEN);
  });

  it('fails the step when creating the release fails', () => {
    const { exitCode } = run({ env: { ...SETTINGS, FAIL_ON: 'releases' } });

    expect(exitCode).toBe(1);
    expect(calls()).toHaveLength(1);
    expect(maps()).toEqual([]);
  });

  it('skips the upload loudly without any tracker setting, still leaving no map behind', () => {
    const { exitCode, output } = run({ env: {} });

    expect(exitCode).toBe(0);
    expect(output).toContain(
      'Source map upload skipped: SENTRY_URL, SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN not set',
    );
    expect(calls()).toEqual([]);
    expect(maps()).toEqual([]);
    expect(existsSync(join(dist, 'assets/index-abc.js'))).toBe(true);
  });

  it('refuses partial tracker settings, naming each missing one', () => {
    const { exitCode, output } = run({
      env: { SENTRY_URL: SETTINGS.SENTRY_URL },
    });

    expect(exitCode).toBe(1);
    expect(output).toContain(
      'Missing prerequisite: SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN',
    );
    expect(calls()).toEqual([]);
    expect(maps()).toEqual([]);
  });

  it('refuses a revision that is not a commit sha', () => {
    const { exitCode, output } = run({ revision: 'unversioned' });

    expect(exitCode).toBe(1);
    expect(output).toContain('--revision must be a 40-character commit sha');
    expect(calls()).toEqual([]);
    expect(maps()).toEqual([]);
  });

  it('fails a build that produced no source maps', () => {
    for (const file of maps()) rmSync(join(dist, file));

    const { exitCode, output } = run();

    expect(exitCode).toBe(1);
    expect(output).toContain('no .map file');
    expect(calls()).toEqual([]);
  });

  it('names uploaded files so web and desktop (views://) frames both resolve', () => {
    run();
    const prefix = calls()[1]?.match(/--url-prefix=(\S+)/)?.[1];
    // The tracker's `~` stands for any scheme and host.
    const uploaded = `${prefix}assets/index-abc.js`.replace(/^~/, '');

    for (const frame of [
      'https://church.example.org/assets/index-abc.js',
      'views://mainview/assets/index-abc.js',
    ]) {
      expect(new URL(frame).pathname).toBe(uploaded);
    }
  });
});

describe('web image build', () => {
  const dockerfile = readFileSync(
    resolve(ROOT, 'deployment/web.Dockerfile'),
    'utf8',
  );
  const build = dockerfile.split(/^FROM /m)[1] ?? '';

  it('tags the bundle and its uploaded maps with the same revision', () => {
    expect(build).toContain('VITE_APP_REVISION=$APP_REVISION');
    expect(build).toContain('--sourcemap hidden');
    expect(build).toContain('--revision="$APP_REVISION"');
  });

  it('reads the tracker settings as optional build secrets, never args or layers', () => {
    for (const name of Object.keys(SETTINGS)) {
      // Optional, so an unconfigured build reaches the script and skips the upload.
      expect(build).toContain(`--mount=type=secret,id=${name},env=${name} `);
      expect(dockerfile).not.toContain(`ARG ${name}`);
    }
    expect(build).not.toContain('required=true');
  });
});
