import type React from 'react';
import { createContext, useContext, useMemo } from 'react';

interface TimezoneContextType {
  churchTimezone: string;
}

const TimezoneContext = createContext<TimezoneContextType | undefined>(
  undefined,
);

interface TimezoneProviderProps {
  children: React.ReactNode;
  /** IANA Church Timezone of the Active Church, from the entry gate. */
  churchTimezone: string;
}

export function TimezoneProvider({
  children,
  churchTimezone,
}: TimezoneProviderProps) {
  const value = useMemo(() => ({ churchTimezone }), [churchTimezone]);
  return (
    <TimezoneContext.Provider value={value}>
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
