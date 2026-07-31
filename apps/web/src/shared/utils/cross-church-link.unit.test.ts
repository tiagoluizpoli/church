import { describe, expect, it } from 'vitest';
import {
  extractRequestedChurchId,
  resolveCrossChurchDeepLink,
  stripCrossChurchLinkParam,
} from './cross-church-link';

describe('resolveCrossChurchDeepLink', () => {
  it('passes through when the link carries no Church target', () => {
    expect(
      resolveCrossChurchDeepLink({
        requestedChurchId: undefined,
        currentChurchId: 'church-a',
        memberChurchIds: ['church-a'],
      }),
    ).toEqual({ kind: 'passthrough' });
  });

  it('passes through when the link targets the current Active Church', () => {
    expect(
      resolveCrossChurchDeepLink({
        requestedChurchId: 'church-a',
        currentChurchId: 'church-a',
        memberChurchIds: ['church-a', 'church-b'],
      }),
    ).toEqual({ kind: 'passthrough' });
  });

  it('auto-selects the target when no Active Church exists yet and the caller is a member', () => {
    expect(
      resolveCrossChurchDeepLink({
        requestedChurchId: 'church-b',
        currentChurchId: null,
        memberChurchIds: ['church-a', 'church-b'],
      }),
    ).toEqual({ kind: 'auto-select', churchId: 'church-b' });
  });

  it('requires confirmation when the link targets another Church the caller is a member of', () => {
    expect(
      resolveCrossChurchDeepLink({
        requestedChurchId: 'church-b',
        currentChurchId: 'church-a',
        memberChurchIds: ['church-a', 'church-b'],
      }),
    ).toEqual({ kind: 'needs-confirmation', churchId: 'church-b' });
  });

  it('denies access without leaking membership when the caller has no membership in the target Church', () => {
    expect(
      resolveCrossChurchDeepLink({
        requestedChurchId: 'church-z',
        currentChurchId: 'church-a',
        memberChurchIds: ['church-a', 'church-b'],
      }),
    ).toEqual({ kind: 'access-denied' });
  });

  it('denies access when there is no Active Church yet and the caller has no membership in the target Church', () => {
    expect(
      resolveCrossChurchDeepLink({
        requestedChurchId: 'church-z',
        currentChurchId: null,
        memberChurchIds: ['church-a'],
      }),
    ).toEqual({ kind: 'access-denied' });
  });
});

describe('extractRequestedChurchId', () => {
  it('reads the church search param when present', () => {
    expect(extractRequestedChurchId({ search: { church: 'church-b' } })).toBe(
      'church-b',
    );
  });

  it('returns undefined when the param is absent', () => {
    expect(
      extractRequestedChurchId({ search: { section: 'availability' } }),
    ).toBe(undefined);
  });

  it('returns undefined for a non-object search value', () => {
    expect(extractRequestedChurchId({ search: null })).toBe(undefined);
  });

  it('returns undefined when the param is present but not a string', () => {
    expect(extractRequestedChurchId({ search: { church: 42 } })).toBe(
      undefined,
    );
  });
});

describe('stripCrossChurchLinkParam', () => {
  it('drops the church param while keeping the rest of the destination', () => {
    expect(
      stripCrossChurchLinkParam({
        href: '/scheduling/planning-cycles?church=church-b&view=board#upcoming',
      }),
    ).toBe('/scheduling/planning-cycles?view=board#upcoming');
  });

  it('leaves a destination with no church param untouched', () => {
    expect(
      stripCrossChurchLinkParam({ href: '/dashboard?section=availability' }),
    ).toBe('/dashboard?section=availability');
  });
});
