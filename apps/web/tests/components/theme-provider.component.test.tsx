import { render } from '@testing-library/react';
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
});
