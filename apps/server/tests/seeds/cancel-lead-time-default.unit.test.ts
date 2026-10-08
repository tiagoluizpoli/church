import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CANCEL_LEAD_TIME_DAYS } from '../../seeds/e2e/recipes/scheduling-cycle-window';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

interface ReadSourceInput {
  path: string;
}

function readSource({ path }: ReadSourceInput): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

interface MatchDefaultInput {
  source: string;
  pattern: RegExp;
}

function matchDefault({ source, pattern }: MatchDefaultInput): number {
  const value = pattern.exec(source)?.[1];
  if (value === undefined) throw new Error(`no match for ${pattern}`);
  return Number(value);
}

// The env package validates on import, so its default is read as source.
describe('DEFAULT_CANCEL_LEAD_TIME_DAYS', () => {
  it('equals the env package default of ASSIGNMENT_CANCEL_LEAD_TIME_DAYS', () => {
    const source = readSource({ path: 'packages/env/src/server.ts' });

    expect(
      matchDefault({
        source,
        pattern: /ASSIGNMENT_CANCEL_LEAD_TIME_DAYS:[^\n]*\.default\((\d+)\)/,
      }),
    ).toBe(DEFAULT_CANCEL_LEAD_TIME_DAYS);
  });

  it('equals the server env schema default', () => {
    const source = readSource({ path: 'apps/server/.env.schema' });

    expect(
      matchDefault({
        source,
        pattern: /^ASSIGNMENT_CANCEL_LEAD_TIME_DAYS=(\d+)$/m,
      }),
    ).toBe(DEFAULT_CANCEL_LEAD_TIME_DAYS);
  });
});
