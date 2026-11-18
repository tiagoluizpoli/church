import { m } from '@church/i18n/messages';
import { describe, expect, it } from 'vitest';
import {
  membershipRemovedMessage,
  removedFromSearchSchema,
} from '@/shared/utils/membership-removal';

describe('removedFromSearchSchema', () => {
  it('accepts a search object with a string removedFrom', () => {
    const result = removedFromSearchSchema.parse({
      removedFrom: 'Igreja Central',
    });

    expect(result).toEqual({ removedFrom: 'Igreja Central' });
  });

  it('accepts a search object with removedFrom absent', () => {
    const result = removedFromSearchSchema.parse({});

    expect(result).toEqual({ removedFrom: undefined });
  });

  it('rejects a non-string removedFrom', () => {
    expect(() => removedFromSearchSchema.parse({ removedFrom: 42 })).toThrow();
  });
});

describe('membershipRemovedMessage', () => {
  it('names the former Church and never the remover', () => {
    const message = membershipRemovedMessage({ churchName: 'Igreja Central' });

    expect(message).toBe(
      m.no_access_removed_from({ churchName: 'Igreja Central' }),
    );
  });
});
