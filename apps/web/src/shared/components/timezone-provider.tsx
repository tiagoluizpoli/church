import type React from 'react';
import { createContext, useContext } from 'react';

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
  return (
    <TimezoneContext.Provider value={{ churchTimezone }}>
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
