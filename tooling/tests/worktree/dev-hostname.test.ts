import { describe, expect, it } from 'bun:test';
import {
  DEV_HOSTNAME_SUFFIX,
  worktreeHostname,
} from '../../worktree/dev-hostname';

const DNS_LABEL_LIMIT = 63;

describe('worktreeHostname', () => {
  it.each([
    ['develop', 'church-develop.dev.home.arpa'],
    ['feature_a', 'church-feature-a.dev.home.arpa'],
    ['feature_b__cc4d8924', 'church-feature-b--cc4d8924.dev.home.arpa'],
  ])('names worktree %s %s', (worktree, hostname) => {
    expect(worktreeHostname({ worktree })).toBe(hostname);
  });

  it('keeps the longest identity within one DNS label', () => {
    const worktree = `${'a'.repeat(42)}__0123abcd`;
    const [label = ''] = worktreeHostname({ worktree }).split('.');

    expect(label.length).toBeLessThanOrEqual(DNS_LABEL_LIMIT);
    expect(label).toMatch(/^[a-z0-9-]+$/);
  });

  it('stays under the controlled development suffix', () => {
    expect(worktreeHostname({ worktree: 'x' })).toEndWith(
      `.${DEV_HOSTNAME_SUFFIX}`,
    );
  });
});
