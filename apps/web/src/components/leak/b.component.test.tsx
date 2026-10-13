import { getLocale, overwriteGetLocale } from '@church/i18n/runtime';
import { expect, it } from 'vitest';

it('starts on the base locale, then pins pt-BR and never resets', () => {
  expect(getLocale()).toBe('en');
  overwriteGetLocale(() => 'pt-BR');
});
