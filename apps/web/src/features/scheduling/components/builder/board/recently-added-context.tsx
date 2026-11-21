import { createContext, useContext } from 'react';

/** Assignment ids a just-applied proposal wrote, lit briefly on the board. */
const RecentlyAddedContext = createContext<ReadonlySet<string>>(new Set());

export const RecentlyAddedProvider = RecentlyAddedContext.Provider;

export function useRecentlyAdded() {
  return useContext(RecentlyAddedContext);
}
