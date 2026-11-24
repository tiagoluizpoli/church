import { describe, expect, it } from 'vitest';
import { formatVolunteerInitials } from '@/utils/format-volunteer-initials';

// Smoke test for the `unit` project (node env): proves alias + env load.
describe('vitest unit project', () => {
  it('resolves the @/ alias and runs pure logic', () => {
    expect(formatVolunteerInitials({ volunteerName: 'John Doe' })).toBe('JD');
  });
});
