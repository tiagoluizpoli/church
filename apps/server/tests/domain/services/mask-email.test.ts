import { describe, expect, it } from 'vitest';
import { maskEmail } from '@/domain/services/mask-email';

describe('maskEmail', () => {
  it('keeps the first letter and the domain only', () => {
    expect(maskEmail({ email: 'maria.silva@example.com' })).toBe(
      'm***@example.com',
    );
  });

  it('masks a one-letter local part without revealing more', () => {
    expect(maskEmail({ email: 'a@example.com' })).toBe('a***@example.com');
  });
});
