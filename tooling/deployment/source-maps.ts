import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

/**
 * Release source maps (#929), run by deployment/web.Dockerfile after the web
 * build:
 *
 *   source-maps.ts --dist=<web dist> --revision=<sha>
 *
 * uploads the build's hidden source maps to the error tracker (GlitchTip,
 * through sentry-cli) under the revision the web SDK reports as its release,
 * then deletes every `.map` from the served output, whether or not the upload
 * succeeded. A failed upload fails the step, and with it the image build.
 *
 * Files are uploaded as `~/<path in dist>`: `~` matches any scheme and host,
 * so web frames (https://<origin>/assets/…) and desktop frames
 * (views://mainview/assets/…) resolve against the same maps.
 *
 * sentry-cli reads the tracker settings (deployment/.env.schema) from the
 * environment; the token never reaches an argument or the log.
 */

const SETTINGS = [
  'SENTRY_URL',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_AUTH_TOKEN',
] as const;
const REVISION = /^[0-9a-f]{40}$/;

class ReleaseFailure extends Error {}

interface SentryCliInput {
  args: string[];
  failure: string;
}

function sentryCli({ args, failure }: SentryCliInput): void {
  const { exitCode } = Bun.spawnSync(['sentry-cli', ...args], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (exitCode !== 0)
    throw new ReleaseFailure(`${failure} (exit ${exitCode}).`);
}

function main(): void {
  const { values } = parseArgs({
    options: { dist: { type: 'string' }, revision: { type: 'string' } },
  });
  const { dist, revision } = values;
  if (!dist) throw new ReleaseFailure('--dist is required.');
  const maps = readdirSync(dist, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.map'))
    .map((file) => join(dist, file));
  try {
    if (!(revision && REVISION.test(revision)))
      throw new ReleaseFailure('--revision must be a 40-character commit sha.');
    const missing = SETTINGS.filter((name) => !process.env[name]);
    if (missing.length > 0)
      throw new ReleaseFailure(
        `Missing prerequisite: ${missing.join(', ')} not set.`,
      );
    if (maps.length === 0)
      throw new ReleaseFailure(
        `The build left no .map file in ${dist}; build with --sourcemap hidden.`,
      );
    sentryCli({
      args: ['releases', 'new', revision],
      failure: 'Creating the tracker release failed',
    });
    sentryCli({
      args: [
        'sourcemaps',
        'upload',
        `--release=${revision}`,
        '--url-prefix=~/',
        '--strict',
        '--validate',
        dist,
      ],
      failure: 'Source map upload failed',
    });
    console.log(`✓ Uploaded ${maps.length} source maps for ${revision}.`);
  } finally {
    for (const map of maps) rmSync(map);
  }
}

try {
  main();
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
