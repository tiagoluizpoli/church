import { describe, expect, it } from 'vitest';
import { exportFileName } from '@/export-file-name';

describe('exportFileName', () => {
  it('drops characters file systems refuse and collapses spaces', () => {
    expect(
      exportFileName({ name: 'Escala - Kids\t - Out: 2026/27? "A" <b>|\\*' }),
    ).toBe('Escala - Kids - Out 202627 A b');
  });

  it('keeps accents and other letters as written', () => {
    expect(exportFileName({ name: 'Escala - Berçário - Março · 2026' })).toBe(
      'Escala - Berçário - Março · 2026',
    );
  });

  it('appends each suffix after " - "', () => {
    expect(
      exportFileName({
        name: 'Escala - Kids - Outubro',
        suffixes: ['Rascunho', 'parte 1 de 2'],
      }),
    ).toBe('Escala - Kids - Outubro - Rascunho - parte 1 de 2');
  });
});
