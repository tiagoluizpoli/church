import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';

const STORAGE_KEY = 'vite-ui-theme';
const root = document.documentElement;

function renderProvider() {
  return render(
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      storageKey={STORAGE_KEY}
    >
      <p>page</p>
    </ThemeProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
  root.className = '';
});

describe('ThemeProvider stored theme', () => {
  // The component setup's matchMedia stub matches, so `system` is dark.
  it.each([
    { stored: null, painted: 'light' },
    { stored: '', painted: 'light' },
    { stored: 'light', painted: 'light' },
    { stored: 'dark', painted: 'dark' },
    { stored: 'system', painted: 'dark' },
  ])('paints $painted for a stored $stored', ({ stored, painted }) => {
    if (stored !== null) localStorage.setItem(STORAGE_KEY, stored);

    renderProvider();

    expect(root.className).toBe(painted);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
  });

  it.each([
    'not a theme',
    'blue',
    'Dark',
  ])('reads an unknown stored %s as light', (stored) => {
    localStorage.setItem(STORAGE_KEY, stored);

    renderProvider();

    expect(root.className).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('reads an unknown theme written by another tab as light', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    renderProvider();

    localStorage.setItem(STORAGE_KEY, 'not a theme');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: 'not a theme',
        }),
      );
    });

    expect(root.className).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });
});
