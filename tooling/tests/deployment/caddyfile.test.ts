import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { RESERVED_CHURCH_SLUGS } from '../../../packages/domain-rules/src/church-slug';
import { ROOT } from '../env/ci-workflow';

/**
 * #1044: Caddy sends `/{slug}` to the server's head endpoint. An app route
 * missing from the matcher's exclusions would be answered as an unknown
 * Church (404), so the exclusions are exactly the reserved Church Slugs.
 */

const caddyfile = readFileSync(resolve(ROOT, 'deployment/Caddyfile'), 'utf8');

describe('deployment Caddyfile', () => {
  it('keeps every reserved Church Slug out of the Church page route', () => {
    const excluded = caddyfile
      .match(/@churchPage \{[^}]*?not path ([^\n]+)/)?.[1]
      ?.trim()
      .split(/\s+/);

    expect(excluded).toEqual(RESERVED_CHURCH_SLUGS.map((slug) => `/${slug}`));
  });
});
