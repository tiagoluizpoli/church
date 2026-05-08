import type React from 'react';
import { createContext, useContext, useState } from 'react';
import { getBrowserTimezone } from '../utils/date';

export type TimezoneMode = 'church' | 'user';

interface TimezoneContextType {
  mode: TimezoneMode;
  setMode: (mode: TimezoneMode) => void;
  churchTimezone: string;
  effectiveTimezone: string;
  toggleMode: () => void;
}

const TimezoneContext = createContext<TimezoneContextType | undefined>(
  undefined,
);

const STORAGE_KEY = 'church_timezone_mode';

export function TimezoneProvider({
  children,
  initialChurchTimezone = 'UTC',
}: {
  children: React.ReactNode;
  initialChurchTimezone?: string;
}) {
  const [mode, setModeState] = useState<TimezoneMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved as TimezoneMode) || 'church';
  });

  const [churchTimezone] = useState(initialChurchTimezone);

  const setMode = (newMode: TimezoneMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  };

  const toggleMode = () => {
    setMode(mode === 'church' ? 'user' : 'church');
  };

  const effectiveTimezone =
    mode === 'church' ? churchTimezone : getBrowserTimezone();

  return (
    <TimezoneContext.Provider
      value={{
        mode,
        setMode,
        churchTimezone,
        effectiveTimezone,
        toggleMode,
      }}
    >
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezoneContext() {
  const context = useContext(TimezoneContext);
  if (context === undefined) {
    throw new Error(
      'useTimezoneContext must be used within a TimezoneProvider',
    );
  }
  return context;
}
