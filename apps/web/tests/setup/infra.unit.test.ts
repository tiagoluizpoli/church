import { describe, expect, it } from 'vitest';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

// Smoke test for the `unit` project (node env): proves alias + env load.
describe('vitest unit project', () => {
  it('resolves the @/ alias and runs pure logic', () => {
    expect(formatVolunteerName('John Doe')).toBe('John D.');
  });
});
