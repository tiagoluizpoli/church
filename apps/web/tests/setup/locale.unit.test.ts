import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { describe, expect, it } from 'vitest';

// Smoke test: the compiled catalog loads and the test setup pins pt-BR.
describe('test locale', () => {
  it('renders catalog messages in pt-BR', () => {
    expect(getLocale()).toBe('pt-BR');
    expect(m.common_generic_error()).toBe('Algo deu errado. Tente novamente.');
  });
});
