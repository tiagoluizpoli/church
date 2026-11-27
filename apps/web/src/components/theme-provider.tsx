import { ThemeProvider as NextThemesProvider } from 'next-themes';
import * as React from 'react';

export interface ThemeProviderProps {
  children: React.ReactNode;
  storageKey?: string;
  [key: string]: unknown;
}

const KNOWN_THEMES = ['light', 'dark', 'system'];
// next-themes' own default.
const DEFAULT_STORAGE_KEY = 'theme';

// next-themes hands any stored text to classList, which throws on a space.
// As index.html's boot script does: a value the app does not know is light.
function replaceUnknownTheme(storageKey: string) {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored && !KNOWN_THEMES.includes(stored)) {
      localStorage.setItem(storageKey, 'light');
    }
  } catch {
    // Storage is blocked: next-themes cannot read it either.
  }
}

export function ThemeProvider({
  children,
  storageKey = DEFAULT_STORAGE_KEY,
  ...props
}: ThemeProviderProps) {
  // Before next-themes mounts and reads the key.
  React.useState(() => replaceUnknownTheme(storageKey));

  // Another tab's write reaches next-themes through `storage`. Capture runs
  // first, so hand it `light` in place of an unknown value.
  React.useEffect(() => {
    function onStorage(event: StorageEvent) {
      const { key, newValue } = event;
      if (key !== storageKey || !newValue || KNOWN_THEMES.includes(newValue)) {
        return;
      }
      event.stopImmediatePropagation();
      replaceUnknownTheme(storageKey);
      const replacement = new StorageEvent('storage', {
        key,
        newValue: 'light',
      });
      window.dispatchEvent(replacement);
    }

    window.addEventListener('storage', onStorage, { capture: true });
    return () =>
      window.removeEventListener('storage', onStorage, { capture: true });
  }, [storageKey]);

  return (
    <NextThemesProvider {...props} storageKey={storageKey}>
      {children}
    </NextThemesProvider>
  );
}

export { useTheme } from 'next-themes';
