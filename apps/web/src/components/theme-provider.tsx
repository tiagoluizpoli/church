import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type * as React from 'react';

export interface ThemeProviderProps {
  children: React.ReactNode;
  [key: string]: unknown;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

export { useTheme } from 'next-themes';
