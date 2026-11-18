import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { ArtifactCopier } from './failure-bundle';
import { sanitize } from './sanitize';
import { sanitizeTrace } from './sanitize-trace';

/**
 * A failed test run's evidence for its failure bundle (ADR-0005): every
 * regular file of the run's output directory (Playwright's `test-results`:
 * `error-context.md` reports, screenshots, traces) lands under `artifacts/`,
 * trace archives sanitized entry by entry, other text sanitized, other
 * binary evidence (screenshots) as it is.
 */

const BUNDLE_ARTIFACTS_DIR = 'artifacts';
const TEXT = new TextDecoder('utf-8', { fatal: true });

interface ArtifactInput {
  path: string;
  secrets: RegExp[];
}

/** Undefined for an unreadable archive, which is never copied raw. */
function sanitizedArtifact(input: ArtifactInput): Uint8Array | undefined {
  const content = new Uint8Array(readFileSync(input.path));

  if (input.path.endsWith('.zip')) {
    try {
      return sanitizeTrace({ zip: content, secrets: input.secrets });
    } catch {
      return undefined;
    }
  }

  let text: string;
  try {
    text = TEXT.decode(content);
  } catch {
    return content;
  }
  return new TextEncoder().encode(sanitize({ text, secrets: input.secrets }));
}

export interface TestArtifactsInput {
  dir: string;
}

export function testArtifacts(input: TestArtifactsInput): ArtifactCopier {
  return ({ bundlePath, secrets }) => {
    if (!existsSync(input.dir)) return [];

    const copied: string[] = [];
    for (const relative of readdirSync(input.dir, {
      recursive: true,
      encoding: 'utf8',
    }).sort()) {
      const source = join(input.dir, relative);
      if (!lstatSync(source).isFile()) continue;
      const content = sanitizedArtifact({ path: source, secrets });
      if (content === undefined) continue;

      const path = join(BUNDLE_ARTIFACTS_DIR, relative);
      const target = join(bundlePath, path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, content, { mode: 0o600 });
      copied.push(path);
    }
    return copied;
  };
}
