import { describe, expect, it } from 'vitest';
import { isFailedSessionStatus } from '@/shared/utils/outage';

describe('isFailedSessionStatus', () => {
  it.each([
    [undefined, true],
    [0, true],
    [500, true],
    [502, true],
    [503, true],
    [504, true],
    [401, false],
    [403, false],
    [404, false],
  ] as const)('classifies a session call answered with %s as failed: %s', (status, failed) => {
    expect(isFailedSessionStatus(status)).toBe(failed);
  });
});
