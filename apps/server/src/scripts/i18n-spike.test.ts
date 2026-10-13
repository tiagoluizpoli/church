import { greeting, shift_starts } from '@church/i18n/messages';
import { describe, expect, it } from 'vitest';

describe('shared i18n catalog under the server unit project (spike #395)', () => {
  it('renders the requested locale per call', () => {
    expect(greeting({ name: 'Ana' }, { locale: 'pt-BR' })).toBe('Olá, Ana');
    expect(
      shift_starts(
        { start: new Date('2026-10-11T22:30:00Z'), tz: 'America/Sao_Paulo' },
        { locale: 'en' },
      ),
    ).toBe('Shift starts at 19:30');
  });
});
