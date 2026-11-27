import { describe, expect, test } from 'bun:test';
import {
  checkConstitutionVersionBump,
  extractVersion,
  getFileAtRef,
} from '../../validation/constitution-version-guard';

describe('extractVersion', () => {
  test('extracts version from constitution content', () => {
    const content = `
# Church Constitution

**Version**: 1.9.0 | **Ratified**: 2026-05-03
`;
    expect(extractVersion({ content })).toBe('1.9.0');
  });

  test('returns null when no version found', () => {
    const content = 'Some content without version';
    expect(extractVersion({ content })).toBeNull();
  });

  test('extracts version with different formatting', () => {
    const content = '**Version**:   2.0.0   | other stuff';
    expect(extractVersion({ content })).toBe('2.0.0');
  });
});

describe('getFileAtRef', () => {
  test('reads constitution at HEAD', () => {
    const content = getFileAtRef({
      path: '.specify/memory/constitution.md',
      ref: 'HEAD',
    });
    expect(content).not.toBeNull();
    expect(content).toContain('Church Constitution');
  });

  test('returns null for non-existent file', () => {
    const content = getFileAtRef({
      path: 'does-not-exist.md',
      ref: 'HEAD',
    });
    expect(content).toBeNull();
  });
});

describe('checkConstitutionVersionBump', () => {
  test('passes when constitution unchanged from base', () => {
    // On today's code, constitution hasn't changed on this branch
    const result = checkConstitutionVersionBump({
      baseRef: 'origin/spec/1208-ticket-batch',
    });

    expect(result.valid).toBe(true);
    expect(result.failure).toBeNull();
    expect(result.constitutionChanged).toBe(false);
  });

  test('detects when both constitution and version unchanged', () => {
    const result = checkConstitutionVersionBump({
      baseRef: 'origin/spec/1208-ticket-batch',
    });

    expect(result.constitutionChanged).toBe(false);
    expect(result.versionChanged).toBe(false);
    expect(result.valid).toBe(true);
  });
});
