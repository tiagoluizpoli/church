import { greeting } from '@church/i18n/messages';
import { getLocale, overwriteGetLocale } from '@church/i18n/runtime';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nSpike } from './i18n-spike';

const baseGetLocale = getLocale;

describe('shared i18n catalog under the web component project (spike #395)', () => {
  afterEach(() => overwriteGetLocale(baseGetLocale));

  it('renders the base locale with no provider', () => {
    render(<I18nSpike name="Ana" count={3} />);
    expect(
      screen.getByText('Hello, Ana · 3 people needed'),
    ).toBeInTheDocument();
  });

  it('renders pt-BR when the test pins the locale', () => {
    overwriteGetLocale(() => 'pt-BR');
    render(<I18nSpike name="Ana" count={1} />);
    expect(
      screen.getByText('Olá, Ana · 1 pessoa necessária'),
    ).toBeInTheDocument();
  });

  it('picks a locale per call without touching the ambient one', () => {
    expect(greeting({ name: 'Ana' }, { locale: 'pt-BR' })).toBe('Olá, Ana');
    expect(getLocale()).toBe('en');
  });
});
