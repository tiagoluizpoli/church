import { createContext, type ReactNode, useContext, useMemo } from 'react';

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
  const value = useMemo(() => ({ churchId, userId }), [churchId, userId]);
  return (
    <CallerCapabilitiesScope.Provider value={value}>
      {children}
    </CallerCapabilitiesScope.Provider>
  );
}

export function useCallerCapabilitiesScope(): CallerCapabilitiesScopeValue | null {
  return useContext(CallerCapabilitiesScope);
}
