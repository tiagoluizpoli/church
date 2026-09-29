import { afterEach, describe, expect, it } from 'vitest';
import {
  assertReportedPinnedTarget,
  assertServedFromPinnedTarget,
  E2E_TARGET_HEADER,
} from './e2e-target';

// #253: the original failure was an invitation provisioned in one database
// and redeemed in another (INVITATION_NOT_FOUND). These assertions are what
// the setup and redemption journeys use to prove every step ran against the
// run's pinned target.
const PINNED =
  'purpose=e2e worktree=unspecified host=localhost port=5432 database=church_unspecified_e2e';
const OTHER =
  'purpose=e2e worktree=unspecified host=localhost port=5444 database=church_unspecified_e2e';

interface FakeResponseInput {
  headers: Record<string, string>;
}

function fakeResponse({ headers }: FakeResponseInput) {
  return { headers: () => headers, url: () => 'http://localhost:4100/probe' };
}

describe('E2E target assertions', () => {
  const original = process.env.CHURCH_E2E_TARGET_FINGERPRINT;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CHURCH_E2E_TARGET_FINGERPRINT;
    } else {
      process.env.CHURCH_E2E_TARGET_FINGERPRINT = original;
    }
  });

  describe('assertServedFromPinnedTarget', () => {
    it('accepts a response served from the pinned target', () => {
      process.env.CHURCH_E2E_TARGET_FINGERPRINT = PINNED;

      expect(() =>
        assertServedFromPinnedTarget({
          response: fakeResponse({ headers: { [E2E_TARGET_HEADER]: PINNED } }),
          step: 'mint invitation',
        }),
      ).not.toThrow();
    });

    it('rejects a response served from a different target', () => {
      process.env.CHURCH_E2E_TARGET_FINGERPRINT = PINNED;

      expect(() =>
        assertServedFromPinnedTarget({
          response: fakeResponse({ headers: { [E2E_TARGET_HEADER]: OTHER } }),
          step: 'redeem invitation',
        }),
      ).toThrow(/redeem invitation.*port=5444/);
    });

    it('rejects a response that reports no target', () => {
      process.env.CHURCH_E2E_TARGET_FINGERPRINT = PINNED;

      expect(() =>
        assertServedFromPinnedTarget({
          response: fakeResponse({ headers: {} }),
          step: 'mint invitation',
        }),
      ).toThrow(/mint invitation/);
    });

    it('fails when the run pinned no target', () => {
      delete process.env.CHURCH_E2E_TARGET_FINGERPRINT;

      expect(() =>
        assertServedFromPinnedTarget({
          response: fakeResponse({ headers: { [E2E_TARGET_HEADER]: PINNED } }),
          step: 'mint invitation',
        }),
      ).toThrow(/CHURCH_E2E_TARGET_FINGERPRINT/);
    });
  });

  describe('assertReportedPinnedTarget', () => {
    it('accepts script output whose preflight line is the pinned target', () => {
      process.env.CHURCH_E2E_TARGET_FINGERPRINT = PINNED;

      expect(() =>
        assertReportedPinnedTarget({
          output: `${PINNED}\n{"invitationId":"abc"}\n`,
          step: 'provision Church',
        }),
      ).not.toThrow();
    });

    it('rejects script output that resolved a different target', () => {
      process.env.CHURCH_E2E_TARGET_FINGERPRINT = PINNED;

      expect(() =>
        assertReportedPinnedTarget({
          output: `${OTHER}\n{"invitationId":"abc"}\n`,
          step: 'redeem Church Invitation',
        }),
      ).toThrow(/redeem Church Invitation.*port=5444/);
    });

    it('rejects script output that reports any second target', () => {
      process.env.CHURCH_E2E_TARGET_FINGERPRINT = PINNED;

      expect(() =>
        assertReportedPinnedTarget({
          output: `${PINNED}\n${OTHER}\n{}\n`,
          step: 'redeem Church Invitation',
        }),
      ).toThrow(/port=5444/);
    });

    it('rejects script output that reports no target', () => {
      process.env.CHURCH_E2E_TARGET_FINGERPRINT = PINNED;

      expect(() =>
        assertReportedPinnedTarget({
          output: '{"invitationId":"abc"}\n',
          step: 'provision Church',
        }),
      ).toThrow(/provision Church/);
    });
  });
});
