import { describe, expect, it } from 'vitest';
import { validateInternalReturnTarget } from './return-target';

describe('validateInternalReturnTarget', () => {
  it('accepts a same-origin absolute path', () => {
    expect(
      validateInternalReturnTarget({ target: '/scheduling/planning-cycles' }),
    ).toBe('/scheduling/planning-cycles');
  });

  it('preserves path, query and hash exactly', () => {
    const target = '/dashboard?section=availability&eventId=abc#panel';
    expect(validateInternalReturnTarget({ target })).toBe(target);
  });

  it.each([undefined, null, ''])('rejects %p', (target) => {
    expect(validateInternalReturnTarget({ target })).toBeNull();
  });

  it('rejects an external absolute URL', () => {
    expect(
      validateInternalReturnTarget({ target: 'https://evil.example/x' }),
    ).toBeNull();
  });

  it('rejects a protocol-relative target', () => {
    expect(
      validateInternalReturnTarget({ target: '//evil.example/x' }),
    ).toBeNull();
  });

  it('rejects a leading-backslash target', () => {
    expect(
      validateInternalReturnTarget({ target: '/\\evil.example/x' }),
    ).toBeNull();
  });

  it('rejects a percent-encoded protocol-relative target', () => {
    expect(
      validateInternalReturnTarget({ target: '/%2Fevil.example/x' }),
    ).toBeNull();
  });

  it('rejects a percent-encoded backslash target', () => {
    expect(
      validateInternalReturnTarget({ target: '/%5Cevil.example/x' }),
    ).toBeNull();
  });

  it('rejects a double-encoded protocol-relative target', () => {
    expect(
      validateInternalReturnTarget({ target: '/%252Fevil.example/x' }),
    ).toBeNull();
  });

  it('rejects a script-scheme target', () => {
    expect(
      validateInternalReturnTarget({ target: 'javascript:alert(1)' }),
    ).toBeNull();
  });

  it('rejects malformed percent-encoding', () => {
    expect(validateInternalReturnTarget({ target: '/%E0%A4%A' })).toBeNull();
  });

  it('rejects a target with no leading slash', () => {
    expect(validateInternalReturnTarget({ target: 'dashboard' })).toBeNull();
  });
});
