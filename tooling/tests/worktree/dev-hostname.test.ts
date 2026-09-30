import { describe, expect, it } from 'bun:test';
import {
  DEV_HOSTNAME_SUFFIX,
  describeDevDomainProblem,
  devAllowedHosts,
  worktreeHostname,
} from '../../worktree/dev-hostname';

const DNS_LABEL_LIMIT = 63;
const DNS_NAME_LIMIT = 253;
const LONGEST_IDENTITY = `${'a'.repeat(42)}__0123abcd`;

describe('worktreeHostname', () => {
  it.each([
    ['develop', 'church-develop.laptop.dev.home.arpa'],
    ['feature_a', 'church-feature-a.laptop.dev.home.arpa'],
    ['feature_b__cc4d8924', 'church-feature-b--cc4d8924.laptop.dev.home.arpa'],
  ])('names worktree %s %s under the machine domain', (worktree, hostname) => {
    expect(worktreeHostname({ worktree, domain: 'laptop.dev.home.arpa' })).toBe(
      hostname,
    );
  });

  it('falls back to a loopback name when the machine has no domain', () => {
    expect(worktreeHostname({ worktree: 'feature_a' })).toBe(
      'church-feature-a.localhost',
    );
  });

  it('keeps the longest identity within one DNS label', () => {
    const [label = ''] = worktreeHostname({
      worktree: LONGEST_IDENTITY,
    }).split('.');

    expect(label.length).toBeLessThanOrEqual(DNS_LABEL_LIMIT);
    expect(label).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('describeDevDomainProblem', () => {
  it.each([
    'homelab.dev.home.arpa',
    'laptop.dev.home.arpa',
    'lan',
    'dev-1.example.internal',
  ])('accepts %s', (domain) => {
    expect(describeDevDomainProblem({ domain })).toBeUndefined();
  });

  it.each([
    '',
    'Laptop.dev.home.arpa',
    'http://laptop.dev.home.arpa',
    'laptop.dev.home.arpa.',
    '.laptop.dev.home.arpa',
    'laptop..arpa',
    '-laptop.arpa',
    'laptop_1.arpa',
    `${'a'.repeat(DNS_LABEL_LIMIT + 1)}.arpa`,
  ])('refuses %p', (domain) => {
    expect(describeDevDomainProblem({ domain })).toBeString();
  });

  it('refuses a domain too long for the longest worktree hostname', () => {
    const longest = Array(4).fill('a'.repeat(50)).join('.');
    const hostname = worktreeHostname({
      worktree: LONGEST_IDENTITY,
      domain: longest,
    });

    expect(hostname.length).toBeGreaterThan(DNS_NAME_LIMIT);
    expect(describeDevDomainProblem({ domain: longest })).toBeString();
  });
});

describe('devAllowedHosts', () => {
  it('accepts the controlled suffix without a machine domain', () => {
    expect(devAllowedHosts({})).toEqual([`.${DEV_HOSTNAME_SUFFIX}`]);
  });

  it('adds nothing for a machine domain under the controlled suffix', () => {
    expect(devAllowedHosts({ domain: 'laptop.dev.home.arpa' })).toEqual([
      `.${DEV_HOSTNAME_SUFFIX}`,
    ]);
  });

  it('adds a machine domain outside the controlled suffix', () => {
    expect(devAllowedHosts({ domain: 'laptop.example.internal' })).toEqual([
      `.${DEV_HOSTNAME_SUFFIX}`,
      '.laptop.example.internal',
    ]);
  });
});
