import { createContext, type ReactNode, useContext } from 'react';

interface CallerCapabilitiesScopeValue {
  churchId: string;
  userId: string | null;
}

interface CallerCapabilitiesScopeProviderProps
  extends CallerCapabilitiesScopeValue {
  children?: ReactNode;
}

const CallerCapabilitiesScope =
  createContext<CallerCapabilitiesScopeValue | null>(null);

export function CallerCapabilitiesScopeProvider({
  churchId,
  userId,
  children,
}: CallerCapabilitiesScopeProviderProps) {
  return (
    <CallerCapabilitiesScope.Provider value={{ churchId, userId }}>
      {children}
    </CallerCapabilitiesScope.Provider>
  );
}

export function useCallerCapabilitiesScope(): CallerCapabilitiesScopeValue | null {
  return useContext(CallerCapabilitiesScope);
}
