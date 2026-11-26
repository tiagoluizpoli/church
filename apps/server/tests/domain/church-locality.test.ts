import { describe, expect, it } from 'vitest';
import { formatChurchLocality } from '@/domain/church-locality';

describe('formatChurchLocality', () => {
  it('joins bairro, city and UF', () => {
    expect(
      formatChurchLocality({ bairro: 'Centro', city: 'Curitiba', uf: 'PR' }),
    ).toBe('Centro, Curitiba/PR');
  });

  it('shows nothing without a Main Address', () => {
    expect(formatChurchLocality(null)).toBeNull();
    expect(formatChurchLocality(undefined)).toBeNull();
  });

  it('shows a private Main Address too, since only the locality is used', () => {
    const privateMain = {
      bairro: 'Batel',
      city: 'Curitiba',
      uf: 'PR',
      isPublic: false,
    };
    expect(formatChurchLocality(privateMain)).toBe('Batel, Curitiba/PR');
  });
});
